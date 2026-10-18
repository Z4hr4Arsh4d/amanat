// P3 owns. Twilio webhooks: incoming WhatsApp messages (I1.1, I1.2, I1.5, I1.8, I1.9) and delivery status (I1.4).
// Order is always: verify signature → dedupe → process → log. No data changes before the signature passes.
import { Prisma, type Integration } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit, leads, timeline } from "@/lib/shared/contracts";
import { claimInbound, finishEvent, logEvent } from "./log";
import { explainError } from "./errors";
import { readSecrets, markSuccess, webhookUrl, type TwilioSecrets } from "./store";
import { STATUS_MAP, validTwilioSignature } from "./twilio";
import { toE164 } from "./phone";
import { ensureConversation, sendAutomatic } from "./messaging";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES"]);
const OPEN_LEAD = { in: ["NEW", "ASSIGNED", "ACKNOWLEDGED", "UNASSIGNED"] as ("NEW" | "ASSIGNED" | "ACKNOWLEDGED" | "UNASSIGNED")[] };

export const twiml = (status = 200) =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', { status, headers: { "Content-Type": "text/xml" } });

type Verified = { ok: true; integration: Integration; params: Record<string, string> } | { ok: false; response: Response };

/** Loads the integration named in the URL and checks X-Twilio-Signature against this workspace's Auth Token. */
export async function verifyTwilioRequest(req: Request, integrationId: string, suffix: string, eventType: string): Promise<Verified> {
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!integration || integration.provider !== "TWILIO") return { ok: false, response: new Response("Unknown webhook", { status: 404 }) };

  const form = await req.formData().catch(() => null);
  const params: Record<string, string> = {};
  form?.forEach((v, k) => { if (typeof v === "string") params[k] = v; });

  const secrets = readSecrets<TwilioSecrets>(integration);
  const query = new URL(req.url).search; // e.g. ?m=<messageId> on status callbacks; it is part of the signed URL
  const url = webhookUrl("twilio", integration.id, suffix) + query;
  const signature = req.headers.get("x-twilio-signature");
  const why = integration.status === "NOT_CONNECTED" || !secrets
    ? "Twilio is not connected for this workspace"
    : !signature ? "Missing X-Twilio-Signature header" : !validTwilioSignature(secrets.authToken, signature, url, params) ? "Invalid signature" : null;

  if (why) {
    // The claimed MessageSid goes in the payload, not externalId, so a forged request can never block the real one.
    await logEvent({
      workspaceId: integration.workspaceId, provider: "TWILIO", direction: "IN", type: eventType, status: "REJECTED",
      error: `${why}. The request was ignored.`, payload: { claimedMessageSid: params.MessageSid, from: params.From, url, ip: req.headers.get("x-forwarded-for") },
    });
    await audit.record({
      workspaceId: integration.workspaceId, actorId: null, actorLabel: "System (Twilio webhook)", action: "integration.webhook_rejected",
      targetType: "Integration", targetId: integration.id, after: { provider: "TWILIO", reason: why, eventType },
    });
    return { ok: false, response: new Response(why, { status: 403 }) };
  }
  return { ok: true, integration, params };
}

/** Find the contact for this phone, or create it. Handles two messages from a new number arriving at once. */
async function findOrCreateContact(workspaceId: string, phone: string, profileName?: string) {
  const existing = await prisma.contact.findFirst({ where: { workspaceId, phone } });
  if (existing) {
    if (existing.deletedAt) {
      // A deleted contact messaged again: bring the record back instead of losing the message.
      await prisma.contact.updateMany({ where: { id: existing.id }, data: { deletedAt: null, version: { increment: 1 } } });
      await timeline.add({ workspaceId, actorId: null, type: "note", contactId: existing.id, summary: "Contact restored because they sent a new WhatsApp message" });
    }
    return { contact: existing, created: false };
  }
  try {
    const contact = await prisma.contact.create({ data: { workspaceId, phone, name: profileName?.trim().slice(0, 80) || phone } });
    await timeline.add({ workspaceId, actorId: null, type: "note", contactId: contact.id, summary: "Contact created from an incoming WhatsApp message" });
    return { contact, created: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { contact: await prisma.contact.findFirstOrThrow({ where: { workspaceId, phone } }), created: false };
    }
    throw e;
  }
}

/** Incoming WhatsApp message. Returns the HTTP response for Twilio. */
export async function handleInbound(integration: Integration, p: Record<string, string>): Promise<Response> {
  const workspaceId = integration.workspaceId;
  const sid = p.MessageSid || p.SmsMessageSid;
  if (!sid) {
    await logEvent({ workspaceId, provider: "TWILIO", direction: "IN", type: "message.inbound", status: "REJECTED", error: "No MessageSid in the request.", payload: p });
    return twiml();
  }

  // I1.8: dedupe. A second delivery of the same MessageSid does nothing.
  const ev = await claimInbound({ workspaceId, provider: "TWILIO", type: "message.inbound", externalId: sid, payload: p });
  if (!ev) {
    await logEvent({ workspaceId, provider: "TWILIO", direction: "IN", type: "message.duplicate", status: "PROCESSED", error: `Duplicate delivery of ${sid}; already processed, ignored.`, payload: { MessageSid: sid } });
    return twiml();
  }

  try {
    const phone = toE164(p.From);
    if (!phone) {
      await finishEvent(ev.id, "REJECTED", `Could not read the sender's phone number ("${p.From}").`);
      return twiml();
    }
    const body = (p.Body ?? "").slice(0, 4000);
    const media = Number(p.NumMedia ?? 0);
    const text = body || (media > 0 ? `[${media} attachment${media > 1 ? "s" : ""}: not shown in Amanat]` : "[empty message]");
    const word = body.trim().toUpperCase();
    const isStop = STOP_WORDS.has(word);
    const isStart = START_WORDS.has(word);

    const { contact, created } = await findOrCreateContact(workspaceId, phone, p.ProfileName);
    const convo = await ensureConversation(workspaceId, contact.id);

    // Lock this conversation row so two messages arriving together cannot both create a lead (Q5).
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${convo.id} FOR UPDATE`;
        const dup = await tx.message.findUnique({ where: { providerSid: sid } });
        if (dup) return { duplicate: true as const };

        let leadId: string | null = null;
        let newLead = false;
        if (!isStop && !isStart) {
          const open = await tx.lead.findFirst({ where: { workspaceId, contactId: contact.id, status: OPEN_LEAD }, orderBy: { createdAt: "desc" } });
          if (open) leadId = open.id;
          else {
            const lead = await leads.intake({ workspaceId, contactId: contact.id, source: "WHATSAPP", actorId: null });
            leadId = lead.id;
            newLead = true;
          }
        }
        const msg = await tx.message.create({
          data: { workspaceId, conversationId: convo.id, direction: "IN", body: text, providerSid: sid, status: "RECEIVED" },
        });
        await tx.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: msg.createdAt } });
        return { duplicate: false as const, msg, leadId, newLead };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    if (result.duplicate) {
      await finishEvent(ev.id, "PROCESSED", "Message was already stored; ignored.");
      return twiml();
    }

    await timeline.add({
      workspaceId, actorId: null, type: "message", contactId: contact.id, opportunityId: convo.opportunityId, leadId: result.leadId,
      summary: `WhatsApp message received: "${text.slice(0, 80)}"`, data: { messageId: result.msg.id, direction: "IN" },
    });

    // I1.9: opt-out / opt back in.
    if (isStop && !contact.optedOut) {
      await prisma.contact.updateMany({ where: { id: contact.id }, data: { optedOut: true, optedOutAt: new Date(), version: { increment: 1 } } });
      await timeline.add({ workspaceId, actorId: null, type: "opt_out", contactId: contact.id, summary: `Customer opted out by sending "${word}". Messages to them are now blocked.` });
    } else if (isStart && contact.optedOut) {
      await prisma.contact.updateMany({ where: { id: contact.id }, data: { optedOut: false, optedOutAt: null, version: { increment: 1 } } });
      await timeline.add({ workspaceId, actorId: null, type: "opt_out", contactId: contact.id, summary: `Customer opted back in by sending "${word}".` });
    }

    // Signature feature: tell the customer who is handling their request.
    let autoReply: string | null = null;
    if (result.newLead && result.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: result.leadId } });
      if (created && lead?.ownerId && !contact.ownerId) {
        await prisma.contact.updateMany({ where: { id: contact.id, ownerId: null }, data: { ownerId: lead.ownerId } });
      }
      autoReply = await autoReplyText(workspaceId, lead?.ownerId ?? null);
      if (autoReply) await sendAutomatic(workspaceId, contact.id, autoReply);
    }

    await finishEvent(ev.id, "PROCESSED", null, {
      ...p, contactId: contact.id, contactCreated: created, leadId: result.leadId, leadCreated: result.newLead, optOut: isStop, autoReply: !!autoReply,
    });
    await markSuccess(workspaceId, "TWILIO");
    return twiml();
  } catch (e) {
    console.error("[twilio inbound]", e);
    // Marked FAILED (not lost): Twilio retries on 5xx, and claimInbound() lets that retry reprocess it.
    await finishEvent(ev.id, "FAILED", `Could not process this message: ${(e as Error).message}`);
    return twiml(500);
  }
}

async function autoReplyText(workspaceId: string, ownerId: string | null) {
  const [cfg, ws] = await Promise.all([
    prisma.assignmentConfig.findUnique({ where: { workspaceId } }),
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
  ]);
  if (cfg && !cfg.autoReplyCustomer) return null;
  const owner = ownerId ? await prisma.user.findFirst({ where: { id: ownerId, workspaceId } }) : null;
  const minutes = Math.max(1, Math.ceil((cfg?.ackWindowSeconds ?? 60) / 60));
  const company = ws?.name ?? "us";
  return owner
    ? `Thank you for contacting ${company}. ${owner.name.split(" ")[0]} will reply within ${minutes} minute${minutes > 1 ? "s" : ""}.`
    : `Thank you for contacting ${company}. Our team will reply shortly.`;
}

/** Delivery status callback (I1.4). Dedupe key = MessageSid + MessageStatus. */
export async function handleStatus(integration: Integration, p: Record<string, string>, messageIdHint: string | null): Promise<Response> {
  const workspaceId = integration.workspaceId;
  const sid = p.MessageSid || p.SmsSid;
  const raw = (p.MessageStatus || p.SmsStatus || "").toLowerCase();
  const mapped = STATUS_MAP[raw];
  if (!sid || !mapped) {
    await logEvent({ workspaceId, provider: "TWILIO", direction: "IN", type: "message.status", status: "REJECTED", error: `Unknown status "${raw}".`, payload: p });
    return new Response(null, { status: 204 });
  }
  const ev = await claimInbound({ workspaceId, provider: "TWILIO", type: `message.status.${raw}`, externalId: `${sid}:${raw}`, payload: p });
  if (!ev) return new Response(null, { status: 204 });

  try {
    // Find by our id from the callback URL (works even if Twilio calls back before we saved the SID), else by SID.
    const msg =
      (messageIdHint && (await prisma.message.findFirst({ where: { id: messageIdHint, workspaceId } }))) ||
      (await prisma.message.findFirst({ where: { providerSid: sid, workspaceId } }));
    if (!msg) {
      await finishEvent(ev.id, "FAILED", `No message found for ${sid}.`);
      return new Response(null, { status: 204 });
    }
    const lower = Object.entries(STATUS_MAP).filter(([, v]) => v.rank < mapped.rank).map(([, v]) => v.status);
    const allowed = mapped.status === "FAILED" ? ["QUEUED", "SENT", "DELIVERED"] : Array.from(new Set(lower));
    const code = p.ErrorCode || null;
    const { count } = await prisma.message.updateMany({
      where: { id: msg.id, workspaceId, status: { in: allowed as ("QUEUED" | "SENT" | "DELIVERED" | "READ")[] }, OR: [{ providerSid: null }, { providerSid: sid }] },
      data: {
        status: mapped.status,
        providerSid: sid,
        ...(mapped.status === "FAILED" ? { errorCode: code, errorReason: explainError("TWILIO", code, p.ErrorMessage || "Delivery failed.") } : {}),
      },
    });
    if (mapped.status === "FAILED" && count) {
      const c = await prisma.conversation.findUnique({ where: { id: msg.conversationId } });
      await timeline.add({ workspaceId, actorId: null, type: "message", contactId: c?.contactId, summary: `WhatsApp message not delivered: ${explainError("TWILIO", code, p.ErrorMessage)}`, data: { messageId: msg.id } });
    }
    await finishEvent(ev.id, "PROCESSED", count ? null : `Status "${raw}" arrived late; kept the newer status.`);
    await markSuccess(workspaceId, "TWILIO");
    return new Response(null, { status: 204 });
  } catch (e) {
    await finishEvent(ev.id, "FAILED", (e as Error).message);
    return new Response(null, { status: 500 });
  }
}

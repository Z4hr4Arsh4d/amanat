// P3 owns. Provider-neutral handling of incoming WhatsApp messages and delivery statuses.
// Twilio and Meta webhooks verify their own signatures, then call these (I1.1, I1.4, I1.5, I1.8, I1.9).
import { Prisma, type Integration } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit, leads, timeline } from "@/lib/shared/contracts";
import { claimInbound, finishEvent, logEvent } from "./log";
import { explainError } from "./errors";
import { markSuccess } from "./store";
import { STATUS_MAP } from "./status";
import { ensureConversation, sendAutomatic, type Channel } from "./messaging";

type WaProvider = "TWILIO" | "META" | "WEBCHAT";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES"]);
const OPEN_LEAD = { in: ["NEW", "ASSIGNED", "ACKNOWLEDGED", "UNASSIGNED"] as ("NEW" | "ASSIGNED" | "ACKNOWLEDGED" | "UNASSIGNED")[] };

/** Records a webhook that failed verification (I1.2). The claimed id goes in the payload, never in
 *  externalId, so a forged request can never block the real message. */
export async function rejectWebhook(i: Integration, provider: WaProvider, eventType: string, why: string, payload: unknown) {
  await logEvent({ workspaceId: i.workspaceId, provider, direction: "IN", type: eventType, status: "REJECTED", error: `${why}. The request was ignored.`, payload });
  await audit.record({
    workspaceId: i.workspaceId, actorId: null, actorLabel: `System (${provider === "META" ? "WhatsApp" : "Twilio"} webhook)`,
    action: "integration.webhook_rejected", targetType: "Integration", targetId: i.id, after: { provider, reason: why, eventType },
  });
}

async function findOrCreateContact(workspaceId: string, phone: string, profileName?: string, via = "WhatsApp message") {
  const existing = await prisma.contact.findFirst({ where: { workspaceId, phone } });
  if (existing) {
    if (existing.deletedAt) {
      // A deleted contact messaged again: bring the record back instead of losing the message.
      await prisma.contact.updateMany({ where: { id: existing.id }, data: { deletedAt: null, version: { increment: 1 } } });
      await timeline.add({ workspaceId, actorId: null, type: "note", contactId: existing.id, summary: `Contact restored because they sent a new ${via}` });
    }
    return { contact: existing, created: false };
  }
  try {
    const contact = await prisma.contact.create({ data: { workspaceId, phone, name: profileName?.trim().slice(0, 80) || phone } });
    await timeline.add({ workspaceId, actorId: null, type: "note", contactId: contact.id, summary: `Contact created from an incoming ${via}` });
    return { contact, created: true };
  } catch (e) {
    // Two messages from a new number at the same moment: the second one uses the first one's contact.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { contact: await prisma.contact.findFirstOrThrow({ where: { workspaceId, phone } }), created: false };
    }
    throw e;
  }
}

export type IncomingMessage = {
  externalId: string; // MessageSid / wamid — the dedupe key
  from: string; // E.164
  body: string;
  mediaCount?: number;
  profileName?: string;
  raw: unknown; // stored (redacted) in the sync history
};

/** Returns "processed" | "duplicate" | "failed" so the route can answer the provider correctly. */
export async function receiveMessage(i: Pick<Integration, "workspaceId">, provider: WaProvider, m: IncomingMessage, channel: Channel = "WHATSAPP"): Promise<"processed" | "duplicate" | "failed"> {
  const via = channel === "WEBCHAT" ? "web chat message" : "WhatsApp message";
  const workspaceId = i.workspaceId;
  const ev = await claimInbound({ workspaceId, provider, type: "message.inbound", externalId: m.externalId, payload: m.raw });
  if (!ev) {
    await logEvent({ workspaceId, provider, direction: "IN", type: "message.duplicate", status: "PROCESSED", error: `Duplicate delivery of ${m.externalId}; already processed, ignored.`, payload: { id: m.externalId } });
    return "duplicate";
  }
  try {
    const body = m.body.slice(0, 4000);
    const media = m.mediaCount ?? 0;
    const text = body || (media > 0 ? `[${media} attachment${media > 1 ? "s" : ""}: not shown in Amanat]` : "[unsupported message type]");
    const word = body.trim().toUpperCase();
    const isStop = STOP_WORDS.has(word);
    const isStart = START_WORDS.has(word);

    const { contact, created } = await findOrCreateContact(workspaceId, m.from, m.profileName, via);
    const convo = await ensureConversation(workspaceId, contact.id, channel);

    // Lock this conversation row so two messages arriving together cannot both create a lead (Q5).
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${convo.id} FOR UPDATE`;
        if (await tx.message.findUnique({ where: { providerSid: m.externalId } })) return { duplicate: true as const };
        let leadId: string | null = null;
        let newLead = false;
        if (!isStop && !isStart) {
          const open = await tx.lead.findFirst({ where: { workspaceId, contactId: contact.id, status: OPEN_LEAD }, orderBy: { createdAt: "desc" } });
          if (open) leadId = open.id;
          else {
            const lead = await leads.intake({ workspaceId, contactId: contact.id, source: channel === "WEBCHAT" ? "WEB_FORM" : "WHATSAPP", actorId: null });
            leadId = lead.id;
            newLead = true;
          }
        }
        const msg = await tx.message.create({ data: { workspaceId, conversationId: convo.id, direction: "IN", body: text, providerSid: m.externalId, status: "RECEIVED" } });
        await tx.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: msg.createdAt } });
        return { duplicate: false as const, msg, leadId, newLead };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    if (result.duplicate) {
      await finishEvent(ev.id, "PROCESSED", "Message was already stored; ignored.");
      return "duplicate";
    }

    await timeline.add({
      workspaceId, actorId: null, type: "message", contactId: contact.id, opportunityId: convo.opportunityId, leadId: result.leadId,
      summary: `${channel === "WEBCHAT" ? "Web chat" : "WhatsApp"} message received: "${text.slice(0, 80)}"`, data: { messageId: result.msg.id, direction: "IN" },
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
      if (autoReply) await sendAutomatic(workspaceId, contact.id, autoReply, convo.id);
    }

    await finishEvent(ev.id, "PROCESSED", null, {
      raw: m.raw, contactId: contact.id, contactCreated: created, leadId: result.leadId, leadCreated: result.newLead, optOut: isStop, autoReply: !!autoReply,
    });
    await markSuccess(workspaceId, provider);
    return "processed";
  } catch (e) {
    console.error(`[${provider} inbound]`, e);
    // Marked FAILED (not lost): the provider retries on 5xx, and claimInbound() lets that retry reprocess it.
    await finishEvent(ev.id, "FAILED", `Could not process this message: ${(e as Error).message}`);
    return "failed";
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

export type IncomingStatus = {
  providerSid: string;
  status: string; // provider word: sent / delivered / read / failed / undelivered …
  errorCode?: string | null;
  errorMessage?: string | null;
  messageIdHint?: string | null; // our Message id when the provider echoes it back (Twilio ?m=)
  raw: unknown;
};

/** Delivery status (I1.4). Dedupe key = provider id + status. Returns "retry" if the message is not saved yet. */
export async function applyStatus(i: Integration, provider: WaProvider, s: IncomingStatus): Promise<"ok" | "retry"> {
  const workspaceId = i.workspaceId;
  const raw = s.status.toLowerCase();
  const mapped = STATUS_MAP[raw];
  if (!mapped) {
    await logEvent({ workspaceId, provider, direction: "IN", type: "message.status", status: "REJECTED", error: `Unknown status "${raw}".`, payload: s.raw });
    return "ok";
  }
  const ev = await claimInbound({ workspaceId, provider, type: `message.status.${raw}`, externalId: `${s.providerSid}:${raw}`, payload: s.raw });
  if (!ev) return "ok";
  try {
    const msg =
      (s.messageIdHint && (await prisma.message.findFirst({ where: { id: s.messageIdHint, workspaceId } }))) ||
      (await prisma.message.findFirst({ where: { providerSid: s.providerSid, workspaceId } }));
    if (!msg) {
      // The provider can report "sent" before we finished saving its id. Ask it to retry shortly.
      const pending = await prisma.message.count({ where: { workspaceId, direction: "OUT", providerSid: null, status: "QUEUED", createdAt: { gt: new Date(Date.now() - 120_000) } } });
      await finishEvent(ev.id, "FAILED", pending ? `Message for ${s.providerSid} not saved yet; asked the provider to retry.` : `No message found for ${s.providerSid}.`);
      return pending ? "retry" : "ok";
    }
    const lower = Object.values(STATUS_MAP).filter((v) => v.rank < mapped.rank).map((v) => v.status);
    const allowed = mapped.status === "FAILED" ? ["QUEUED", "SENT", "DELIVERED"] : Array.from(new Set(lower));
    const reason = mapped.status === "FAILED" ? explainError(provider, s.errorCode, s.errorMessage || "Delivery failed.") : null;
    const { count } = await prisma.message.updateMany({
      where: { id: msg.id, workspaceId, status: { in: allowed as ("QUEUED" | "SENT" | "DELIVERED" | "READ")[] }, OR: [{ providerSid: null }, { providerSid: s.providerSid }] },
      data: { status: mapped.status, providerSid: s.providerSid, errorCode: reason ? s.errorCode ?? null : null, errorReason: reason },
    });
    if (reason && count) {
      const c = await prisma.conversation.findUnique({ where: { id: msg.conversationId } });
      await timeline.add({ workspaceId, actorId: null, type: "message", contactId: c?.contactId, summary: `WhatsApp message not delivered: ${reason}`, data: { messageId: msg.id } });
    }
    await finishEvent(ev.id, "PROCESSED", count ? null : `Status "${raw}" arrived late; kept the newer status.`);
    await markSuccess(workspaceId, provider);
    return "ok";
  } catch (e) {
    await finishEvent(ev.id, "FAILED", (e as Error).message);
    return "retry";
  }
}

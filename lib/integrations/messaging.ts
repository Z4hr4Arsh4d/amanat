// P3 owns. WhatsApp messaging. Signatures of send() and notifyHandoff() are CONTRACTS.
// Callers are trusted server code; permission/visibility checks happen in the inbox actions.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
// Imported directly, not through lib/shared/contracts.ts: that file also pulls in web-page session code,
// which crashes when this module runs inside the worker (notifyHandoff is called from the escalation worker).
import * as leads from "@/lib/leads";
import * as timeline from "@/lib/crm/timeline";
import { sendRegistered } from "./outbox";
import { connected } from "./store";
import "./twilio"; // registers the "twilio.message" executor
import "./meta"; // registers the "meta.message" executor

const WINDOW_MS = 24 * 3600_000;
const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Which WhatsApp provider this workspace uses. Meta (free) wins when both are connected. */
export async function activeChannel(workspaceId: string) {
  if (await connected(workspaceId, "META")) return { provider: "META" as const, type: "meta.message", label: "WhatsApp (Meta)" };
  if (await connected(workspaceId, "TWILIO")) return { provider: "TWILIO" as const, type: "twilio.message", label: "Twilio WhatsApp" };
  return null;
}

export const NOT_CONNECTED = "WhatsApp is not connected. An admin can connect it on the Integrations page.";

export function optedOutText(c: { name: string; optedOutAt: Date | null }) {
  return `${c.name} opted out${c.optedOutAt ? ` on ${fmtDate(c.optedOutAt)}` : ""}. Messages are blocked to respect their choice.`;
}

/** Find or create the WhatsApp conversation for a contact (safe if two requests do it at once). */
export async function ensureConversation(workspaceId: string, contactId: string) {
  const where = { contactId_channel: { contactId, channel: "WHATSAPP" } };
  const found = await prisma.conversation.findUnique({ where });
  if (found) return found;
  try {
    return await prisma.conversation.create({ data: { workspaceId, contactId, channel: "WHATSAPP" } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return prisma.conversation.findUniqueOrThrow({ where });
    throw e;
  }
}

/** CONTRACT. Send a WhatsApp message (respects opt-out, goes through the outbox). Never throws. */
export async function send(input: { workspaceId: string; contactId: string; body: string; userId: string | null }): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const body = input.body.trim();
    if (!body) return { ok: false, error: "Type a message first." };
    if (body.length > 1600) return { ok: false, error: "The message is too long. Keep it under 1,600 characters." };

    const contact = await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId: input.workspaceId, deletedAt: null } });
    if (!contact) return { ok: false, error: "Contact not found." };
    if (contact.optedOut) return { ok: false, error: optedOutText(contact) };
    if (!contact.phone) return { ok: false, error: `${contact.name} has no phone number. Add one on the contact page.` };
    const channel = await activeChannel(input.workspaceId);
    if (!channel) return { ok: false, error: NOT_CONNECTED };

    const convo = await ensureConversation(input.workspaceId, contact.id);
    const msg = await prisma.message.create({
      data: { workspaceId: input.workspaceId, conversationId: convo.id, direction: "OUT", body, status: "QUEUED", sentById: input.userId },
    });
    await prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: msg.createdAt } });

    const r = await sendRegistered({
      workspaceId: input.workspaceId,
      provider: channel.provider,
      type: channel.type,
      payload: { messageId: msg.id, conversationId: convo.id, to: contact.phone, preview: body.slice(0, 80) },
    });

    await timeline.add({
      workspaceId: input.workspaceId,
      actorId: input.userId,
      type: "message",
      contactId: contact.id,
      opportunityId: convo.opportunityId,
      summary: r.ok || r.retrying ? `WhatsApp message sent: "${body.slice(0, 80)}"` : `WhatsApp message failed: ${r.error}`,
      data: { messageId: msg.id, direction: "OUT" },
    });
    if (input.userId) {
      await leads.markActed({ workspaceId: input.workspaceId, contactId: contact.id, userId: input.userId, action: "message" });
    }
    if (r.ok || r.retrying) return { ok: true, messageId: msg.id, ...(r.retrying ? { error: r.error } : {}) };
    return { ok: false, messageId: msg.id, error: r.error };
  } catch (e) {
    console.error("[messaging.send]", e);
    return { ok: false, error: "Could not send the message because of a problem on our side. Please try again." };
  }
}

/** Re-send a FAILED outbound message (the Retry button). */
export async function retry(input: { workspaceId: string; messageId: string; userId: string }): Promise<{ ok: boolean; error?: string }> {
  const msg = await prisma.message.findFirst({ where: { id: input.messageId, workspaceId: input.workspaceId, direction: "OUT" }, include: { conversation: { include: { contact: true } } } });
  if (!msg) return { ok: false, error: "Message not found." };
  if (msg.status !== "FAILED") return { ok: false, error: "Only failed messages can be retried." };
  const c = msg.conversation.contact;
  if (c.optedOut) return { ok: false, error: optedOutText(c) };
  const channel = await activeChannel(input.workspaceId);
  if (!channel) return { ok: false, error: NOT_CONNECTED };
  // A message Twilio accepted but later failed (e.g. not delivered) gets a fresh send: clear the old reference.
  const { count } = await prisma.message.updateMany({
    where: { id: msg.id, status: "FAILED" },
    data: { status: "QUEUED", providerSid: null, errorCode: null, errorReason: null },
  });
  if (count === 0) return { ok: false, error: "This message is already being retried." };
  const r = await sendRegistered({
    workspaceId: input.workspaceId,
    provider: channel.provider,
    type: channel.type,
    payload: { messageId: msg.id, conversationId: msg.conversationId, to: c.phone, preview: msg.body.slice(0, 80), retryBy: input.userId },
  });
  return r.ok || r.retrying ? { ok: true, error: r.error } : { ok: false, error: r.error };
}

/** True if the customer wrote to us in the last 24h (WhatsApp only allows free-form replies then). */
export async function inSessionWindow(conversationId: string) {
  const last = await prisma.message.findFirst({ where: { conversationId, direction: "IN" }, orderBy: { createdAt: "desc" } });
  return !!last && Date.now() - last.createdAt.getTime() < WINDOW_MS;
}

/** Automatic message to the customer (no employee). Skipped quietly when it cannot be delivered. */
export async function sendAutomatic(workspaceId: string, contactId: string, body: string) {
  const convo = await prisma.conversation.findUnique({ where: { contactId_channel: { contactId, channel: "WHATSAPP" } } });
  if (!convo || !(await inSessionWindow(convo.id))) return { ok: false, error: "Customer has no open WhatsApp session." };
  return send({ workspaceId, contactId, body, userId: null });
}

/**
 * CONTRACT. Tell the customer their lead changed hands. P2 calls this after an escalation/reassignment.
 * "Hina is unavailable; Omar is now handling your request."
 */
export async function notifyHandoff(input: { workspaceId: string; contactId: string; newOwnerName: string }): Promise<void> {
  try {
    const cfg = await prisma.assignmentConfig.findUnique({ where: { workspaceId: input.workspaceId } });
    if (cfg && !cfg.autoReplyCustomer) return;
    const lead = await prisma.lead.findFirst({
      where: { workspaceId: input.workspaceId, contactId: input.contactId, status: { not: "CLOSED" } },
      orderBy: { createdAt: "desc" },
      include: { assignments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const fromId = lead?.assignments[0]?.fromUserId;
    const old = fromId ? await prisma.user.findFirst({ where: { id: fromId, workspaceId: input.workspaceId } }) : null;
    const first = (n: string) => n.split(" ")[0];
    const body = old
      ? `${first(old.name)} is unavailable; ${first(input.newOwnerName)} is now handling your request.`
      : `${first(input.newOwnerName)} is now handling your request.`;
    await sendAutomatic(input.workspaceId, input.contactId, body);
  } catch (e) {
    console.error("[messaging.notifyHandoff]", e);
  }
}

// P3 owns. Inbox queries and actions (I1.3, I1.4, I1.6, I1.7, I1.9).
// I1.6 visibility: a user sees a conversation if they are its assignee, the contact's owner,
// or the owner of the contact's open lead — unless they have crm.view + dashboard.company (sees all).
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { audit, can, requirePermission, scoped, timeline, type Ctx } from "@/lib/shared/contracts";
import { NotFound } from "@/lib/core/errors";
import { connected, type TwilioConfig, type TwilioSecrets } from "./store";
import { activeChannel, NOT_CONNECTED } from "./messaging";
import * as messaging from "./messaging";

const OPEN = { in: ["NEW", "ASSIGNED", "ACKNOWLEDGED", "UNASSIGNED"] as ("NEW" | "ASSIGNED" | "ACKNOWLEDGED" | "UNASSIGNED")[] };
const WINDOW_MS = 24 * 3600_000;

export const seesAll = (ctx: Ctx) => can(ctx, "crm.view") && can(ctx, "dashboard.company");

export function visibleWhere(ctx: Ctx): Prisma.ConversationWhereInput {
  if (seesAll(ctx)) return {};
  return {
    OR: [
      { assigneeId: ctx.userId },
      { contact: { ownerId: ctx.userId } },
      { assigneeId: null, contact: { leads: { some: { ownerId: ctx.userId, status: OPEN } } } },
    ],
  };
}

const convoInclude = {
  contact: {
    select: {
      id: true, name: true, phone: true, optedOut: true, optedOutAt: true, ownerId: true,
      leads: { where: { status: OPEN }, orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, ownerId: true, status: true } },
    },
  },
} satisfies Prisma.ConversationInclude;

type ConvoRow = Prisma.ConversationGetPayload<{ include: typeof convoInclude }>;

/** Who is responsible for this conversation, and why. */
function effectiveAssignee(c: ConvoRow): { id: string | null; why: "set by manager" | "lead owner" | "contact owner" | "nobody" } {
  if (c.assigneeId) return { id: c.assigneeId, why: "set by manager" };
  const leadOwner = c.contact.leads[0]?.ownerId;
  if (leadOwner) return { id: leadOwner, why: "lead owner" };
  if (c.contact.ownerId) return { id: c.contact.ownerId, why: "contact owner" };
  return { id: null, why: "nobody" };
}

async function userNames(ctx: Ctx, ids: (string | null | undefined)[]) {
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (!uniq.length) return new Map<string, string>();
  const users = await scoped(ctx).user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export const ListQuery = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});
const PAGE = 30;

export async function listConversations(ctx: Ctx, raw: Record<string, string | undefined>) {
  const f = ListQuery.parse(raw);
  const db = scoped(ctx);
  const where: Prisma.ConversationWhereInput = {
    AND: [
      visibleWhere(ctx),
      { contact: { deletedAt: null } },
      f.q ? { contact: { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { phone: { contains: f.q.replace(/\s/g, "") } }] } } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    db.conversation.findMany({
      where, include: { ...convoInclude, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { lastMessageAt: "desc" }, skip: (f.page - 1) * PAGE, take: PAGE,
    }),
    db.conversation.count({ where }),
  ]);
  const unread = await Promise.all(
    rows.map((c) => db.message.count({ where: { conversationId: c.id, direction: "IN", ...(c.lastReadAt ? { createdAt: { gt: c.lastReadAt } } : {}) } })),
  );
  const assignees = rows.map(effectiveAssignee);
  const names = await userNames(ctx, assignees.map((a) => a.id));
  return {
    total, page: f.page, pages: Math.max(1, Math.ceil(total / PAGE)),
    items: rows.map((c, i) => ({
      id: c.id,
      contact: { id: c.contact.id, name: c.contact.name, phone: c.contact.phone, optedOut: c.contact.optedOut },
      assignee: { id: assignees[i].id, name: assignees[i].id ? names.get(assignees[i].id!) ?? "Unknown" : null, why: assignees[i].why },
      last: c.messages[0] ? { body: c.messages[0].body.slice(0, 120), direction: c.messages[0].direction, status: c.messages[0].status, at: c.messages[0].createdAt } : null,
      unread: unread[i],
      lastMessageAt: c.lastMessageAt,
    })),
  };
}

async function loadVisible(ctx: Ctx, conversationId: string) {
  const c = await scoped(ctx).conversation.findFirst({ where: { AND: [{ id: conversationId }, visibleWhere(ctx)] }, include: convoInclude });
  if (!c) throw NotFound(); // other workspace, or not yours to see: same answer (F1.6)
  return c;
}

export async function getThread(ctx: Ctx, conversationId: string) {
  const c = await loadVisible(ctx, conversationId);
  const db = scoped(ctx);
  const msgs = await db.message.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: "desc" }, take: 200 });
  msgs.reverse();
  const a = effectiveAssignee(c);
  if (a.id === ctx.userId || a.id === null) await db.conversation.update({ where: { id: c.id }, data: { lastReadAt: new Date() } });

  const lastIn = [...msgs].reverse().find((m) => m.direction === "IN");
  const windowEndsAt = lastIn ? new Date(lastIn.createdAt.getTime() + WINDOW_MS) : null;
  const channel = await activeChannel(ctx.workspaceId);
  const twilio = channel?.provider === "TWILIO" ? await connected<TwilioSecrets, TwilioConfig>(ctx.workspaceId, "TWILIO") : null;
  const canAssign = can(ctx, "leads.reassign");
  const names = await userNames(ctx, [a.id, ...msgs.map((m) => m.sentById)]);
  const team = canAssign ? await db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, status: true } }) : [];

  const blocked = c.contact.optedOut
    ? messaging.optedOutText(c.contact)
    : !c.contact.phone ? `${c.contact.name} has no phone number. Add one on the contact page.`
    : !channel ? NOT_CONNECTED : null;

  return {
    id: c.id,
    contact: { id: c.contact.id, name: c.contact.name, phone: c.contact.phone, optedOut: c.contact.optedOut, optedOutAt: c.contact.optedOutAt },
    assignee: { id: a.id, name: a.id ? names.get(a.id) ?? "Unknown" : null, why: a.why },
    canAssign, team,
    blocked,
    joinCode: twilio?.config.joinCode ?? null,
    channel: channel?.label ?? null,
    windowEndsAt: windowEndsAt && windowEndsAt.getTime() > Date.now() ? windowEndsAt : null,
    messages: msgs.map((m) => ({
      id: m.id, direction: m.direction, body: m.body, status: m.status, errorCode: m.errorCode, errorReason: m.errorReason,
      createdAt: m.createdAt, sentBy: m.direction === "OUT" ? (m.sentById ? names.get(m.sentById) ?? "Someone" : "Automatic reply") : null,
    })),
  };
}
export type Thread = Awaited<ReturnType<typeof getThread>>;

/** Thread for the contact page slot. Returns { conversationId: null } when there is no conversation yet. */
export async function threadForContact(ctx: Ctx, contactId: string) {
  requirePermission(ctx, "crm.view");
  const contact = await scoped(ctx).contact.findFirst({ where: { id: contactId, deletedAt: null } });
  if (!contact) throw NotFound();
  const c = await scoped(ctx).conversation.findFirst({ where: { contactId, channel: "WHATSAPP" } });
  if (!c) return { conversationId: null, hidden: false, contact: { id: contact.id, name: contact.name, phone: contact.phone, optedOut: contact.optedOut } };
  const visible = await scoped(ctx).conversation.findFirst({ where: { AND: [{ id: c.id }, visibleWhere(ctx)] }, select: { id: true } });
  if (!visible) return { conversationId: null, hidden: true, contact: { id: contact.id, name: contact.name, phone: contact.phone, optedOut: contact.optedOut } };
  return { conversationId: c.id, hidden: false, thread: await getThread(ctx, c.id) };
}

export const SendSchema = z.object({
  conversationId: z.string().min(1).max(40).optional(),
  contactId: z.string().min(1).max(40).optional(),
  body: z.string().trim().min(1, "Type a message first.").max(1600, "The message is too long. Keep it under 1,600 characters."),
}).refine((x) => x.conversationId || x.contactId, "Choose a conversation first.");

export async function sendMessage(ctx: Ctx, input: unknown) {
  const f = SendSchema.parse(input);
  let contactId: string;
  if (f.conversationId) {
    contactId = (await loadVisible(ctx, f.conversationId)).contact.id;
  } else {
    // Starting a new conversation from the contact page: needs CRM edit rights on the contact.
    requirePermission(ctx, "crm.edit");
    const contact = await scoped(ctx).contact.findFirst({ where: { id: f.contactId!, deletedAt: null } });
    if (!contact) throw NotFound();
    const existing = await scoped(ctx).conversation.findFirst({ where: { contactId: contact.id, channel: "WHATSAPP" } });
    if (existing) await loadVisible(ctx, existing.id);
    contactId = contact.id;
  }
  return messaging.send({ workspaceId: ctx.workspaceId, contactId, body: f.body, userId: ctx.userId });
}

export async function retryMessage(ctx: Ctx, messageId: string) {
  const m = await scoped(ctx).message.findFirst({ where: { id: messageId } });
  if (!m) throw NotFound();
  await loadVisible(ctx, m.conversationId);
  return messaging.retry({ workspaceId: ctx.workspaceId, messageId: m.id, userId: ctx.userId });
}

/** Manager changes who handles a conversation. null = follow the lead owner again. */
export async function setAssignee(ctx: Ctx, conversationId: string, userId: string | null) {
  requirePermission(ctx, "leads.reassign");
  const c = await loadVisible(ctx, conversationId);
  const names = await userNames(ctx, [c.assigneeId, userId]);
  if (userId && !names.has(userId)) throw NotFound();
  await scoped(ctx).conversation.update({ where: { id: c.id }, data: { assigneeId: userId } });
  const to = userId ? names.get(userId)! : "the lead owner (automatic)";
  await audit.record({
    workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "conversation.assignee_changed",
    targetType: "Conversation", targetId: c.id, before: { assigneeId: c.assigneeId }, after: { assigneeId: userId },
  });
  await timeline.add({ workspaceId: ctx.workspaceId, actorId: ctx.userId, type: "assignment", contactId: c.contact.id, summary: `WhatsApp conversation assigned to ${to} by ${ctx.name}` });
  return { ok: true as const, message: `Conversation assigned to ${to}.` };
}

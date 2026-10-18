// P2 owns. Live updates (Q11): what changed for this user since `since`. Polled every 3 seconds by <LivePoller/>.
import { z } from "zod";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { handler } from "@/lib/core/errors";

const Query = z.object({ since: z.string().datetime({ offset: true }).optional() });

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const ctx = await requireUser();
  requirePermission(ctx, "crm.view");
  const q = Query.parse({ since: new URL(req.url).searchParams.get("since") ?? undefined });
  const now = new Date(); // taken before the queries so nothing falls between two polls
  const db = scoped(ctx);
  const unread = await db.notification.count({ where: { userId: ctx.userId, channel: "INAPP", readAt: null } });
  if (!q.since) return Response.json({ now: now.toISOString(), unread, notifications: [], leads: [], messages: [] });

  const since = new Date(q.since);
  const company = ctx.permissions.has("dashboard.company");

  const notifications = await db.notification.findMany({
    where: { userId: ctx.userId, channel: "INAPP", createdAt: { gt: since } },
    orderBy: { createdAt: "asc" }, take: 20, select: { id: true, title: true, body: true, leadId: true, createdAt: true },
  });

  // Lead changes: new leads and hand-overs. Personal unless the user sees company-wide figures.
  const changes = await db.leadAssignment.findMany({
    where: { createdAt: { gt: since }, ...(company ? {} : { OR: [{ toUserId: ctx.userId }, { fromUserId: ctx.userId }] }) },
    orderBy: { createdAt: "asc" }, take: 20, select: { id: true, leadId: true, kind: true, createdAt: true },
  });

  // Incoming customer messages on conversations this user can see (assignee or contact owner), or all for company viewers.
  const messages = await db.message.findMany({
    where: {
      direction: "IN", createdAt: { gt: since },
      ...(company ? {} : { conversation: { OR: [{ assigneeId: ctx.userId }, { contact: { ownerId: ctx.userId } }] } }),
    },
    orderBy: { createdAt: "asc" }, take: 20,
    select: { id: true, body: true, createdAt: true, conversation: { select: { contact: { select: { name: true } } } } },
  });

  return Response.json({
    now: now.toISOString(), unread,
    notifications: notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    leads: changes.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    messages: messages.map((m) => ({ id: m.id, contactName: m.conversation.contact.name, body: m.body.slice(0, 120), createdAt: m.createdAt.toISOString() })),
  });
});

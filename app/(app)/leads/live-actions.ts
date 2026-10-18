"use server";
// P2 owns. Notification bell actions (F3.9).
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";

export type BellItem = { id: string; title: string; body: string; leadId: string | null; read: boolean; at: string };

export async function listNotifications() {
  return act(async (): Promise<BellItem[]> => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const rows = await scoped(ctx).notification.findMany({ where: { userId: ctx.userId, channel: "INAPP" }, orderBy: { createdAt: "desc" }, take: 20 });
    return rows.map((n) => ({ id: n.id, title: n.title, body: n.body, leadId: n.leadId, read: !!n.readAt, at: n.createdAt.toISOString() }));
  });
}

export async function markAllNotificationsRead() {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    await scoped(ctx).notification.updateMany({ where: { userId: ctx.userId, channel: "INAPP", readAt: null }, data: { readAt: new Date() } });
    return null;
  });
}

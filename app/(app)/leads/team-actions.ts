"use server";
// P2 owns. Availability actions (F3.2): your own status, and the team panel for admins.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { NotFound } from "@/lib/core/errors";
import { setStatus } from "@/lib/leads/availability";

const Status = z.enum(["AVAILABLE", "BUSY", "ON_LEAVE", "OFFLINE"], "Pick a valid status.");
type StatusValue = z.infer<typeof Status>;

export async function getMyStatus() {
  return act(async (): Promise<StatusValue> => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const me = await scoped(ctx).user.findFirst({ where: { id: ctx.userId }, select: { status: true } });
    if (!me) throw NotFound();
    return me.status;
  });
}

export async function setMyStatus(input: { status: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const status = Status.parse(input.status);
    await setStatus({ workspaceId: ctx.workspaceId, userId: ctx.userId, status, actorId: ctx.userId, actorLabel: ctx.name });
    revalidatePath("/leads");
    return null;
  });
}

export type TeamMember = { id: string; name: string; status: StatusValue; openLeads: number; isYou: boolean };

export async function listTeam() {
  return act(async (): Promise<TeamMember[]> => {
    const ctx = await requireUser();
    requirePermission(ctx, "users.manage");
    const db = scoped(ctx);
    const users = await db.user.findMany({ where: { isActive: true }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" } });
    const counts = await db.lead.groupBy({ by: ["ownerId"], where: { status: { in: ["ASSIGNED", "ACKNOWLEDGED"] } }, _count: { _all: true } });
    const open = new Map(counts.map((c) => [c.ownerId, c._count._all]));
    return users.map((u) => ({ id: u.id, name: u.name, status: u.status, openLeads: open.get(u.id) ?? 0, isYou: u.id === ctx.userId }));
  });
}

export async function setUserStatus(input: { userId: string; status: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "users.manage");
    const userId = z.string().trim().min(1).max(64).parse(input.userId);
    const status = Status.parse(input.status);
    if (!(await scoped(ctx).user.findFirst({ where: { id: userId }, select: { id: true } }))) throw NotFound();
    await setStatus({ workspaceId: ctx.workspaceId, userId, status, actorId: ctx.userId, actorLabel: ctx.name });
    revalidatePath("/leads");
    return null;
  });
}

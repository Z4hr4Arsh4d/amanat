// P2 owns. Manual reassign (PLAN.md §3.5): a person with leads.reassign hands a lead to someone else.
// Counted as kind MANUAL, separately from escalations.
import { prisma } from "@/lib/db";
import { ensureConfig } from "./assign";
import { afterHandover } from "./handover";

export type ReassignResult = { ok: boolean; message: string };

export async function reassign(input: { workspaceId: string; leadId: string; toUserId: string; actorId: string; actorLabel: string }): Promise<ReassignResult> {
  const { workspaceId, leadId, toUserId } = input;
  const cfg = await ensureConfig(workspaceId);

  for (let attempt = 0; attempt < 2; attempt++) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) return { ok: false, message: "We could not find that lead." };
    if (lead.status === "CLOSED") return { ok: false, message: "This lead is closed, so it can't be reassigned." };
    if (lead.ownerId === toUserId && lead.status !== "UNASSIGNED") return { ok: false, message: "That person already has this lead." };

    const to = await prisma.user.findFirst({ where: { id: toUserId, workspaceId, isActive: true }, select: { id: true, name: true } });
    if (!to) return { ok: false, message: "That person is not an active team member. Pick someone else." };
    const from = lead.ownerId ? await prisma.user.findFirst({ where: { id: lead.ownerId, workspaceId }, select: { name: true } }) : null;

    const now = new Date();
    const reason = `${input.actorLabel} reassigned this lead${from ? ` from ${from.name}` : ""} to ${to.name}`;
    const done = await prisma.$transaction(async (tx) => {
      const r = await tx.lead.updateMany({
        where: { id: leadId, workspaceId, version: lead.version },
        data: {
          ownerId: to.id, status: "ASSIGNED", assignedAt: now, firstAssignedAt: lead.firstAssignedAt ?? now,
          deadlineAt: new Date(now.getTime() + cfg.ackWindowSeconds * 1000), acknowledgedAt: null,
          escalationLevel: 0, ownerOnLeaveFlag: false, version: { increment: 1 },
        },
      });
      if (r.count === 0) return false;
      await tx.leadAssignment.create({
        data: { workspaceId, leadId, fromUserId: lead.ownerId, toUserId: to.id, kind: "MANUAL", level: 0, reason, actorId: input.actorId },
      });
      return true;
    });
    if (!done) continue; // changed under us: look again

    await afterHandover({
      workspaceId, leadId, contactId: lead.contactId, kind: "MANUAL", fromName: from?.name ?? null,
      toUserId: to.id, toName: to.name, reason, actorId: input.actorId, actorLabel: input.actorLabel,
      alertTitle: "A lead was reassigned to you",
    });
    return { ok: true, message: `Lead reassigned to ${to.name}.` };
  }
  return { ok: false, message: "This lead just changed. Reload and try again." };
}

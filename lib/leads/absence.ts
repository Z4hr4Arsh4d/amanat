// P2 owns. Absence handling (PLAN.md §3.6).
import { prisma } from "@/lib/db";
import { STATUS_LABEL, ensureConfig, findTarget, loadBusy, loadCandidates } from "./assign";
import { afterHandover } from "./handover";

/**
 * Called by setStatus() when someone goes On leave / Offline (F3.6).
 * - Leads still waiting for their reply move to someone else right away (kind ABSENCE).
 * - Leads they already acknowledged stay with them but get the "Owner away" flag, which puts them in the recovery queue.
 */
export async function handleAbsence(input: { workspaceId: string; userId: string }): Promise<void> {
  const { workspaceId, userId } = input;
  const person = await prisma.user.findFirst({ where: { id: userId, workspaceId }, select: { name: true, status: true } });
  if (!person) return;
  const why = `${person.name} went ${STATUS_LABEL[person.status]}`;

  const cfg0 = await ensureConfig(workspaceId);
  const candidates = await loadCandidates(workspaceId);
  const busy = await loadBusy(cfg0, candidates);

  const waiting = await prisma.lead.findMany({ where: { workspaceId, ownerId: userId, status: "ASSIGNED" }, select: { id: true } });
  for (const { id: leadId } of waiting) {
    try {
      const moved = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "AssignmentConfig" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`;
        const cfg = await tx.assignmentConfig.findUniqueOrThrow({ where: { workspaceId } });
        const lead = await tx.lead.findFirst({ where: { id: leadId, workspaceId } });
        if (!lead || lead.status !== "ASSIGNED" || lead.ownerId !== userId) return null; // already handled
        const now = new Date();
        const { target, notes } = await findTarget(tx, workspaceId, cfg, candidates, busy, { excludeIds: [userId], currentOwnerId: userId, startLevel: 1 });

        if (!target) {
          const reason = `${why}. Nobody else is free right now${notes.length ? ` · ${notes.join(" · ")}` : ""}`;
          const r = await tx.lead.updateMany({
            where: { id: leadId, workspaceId, version: lead.version },
            data: { status: "UNASSIGNED", ownerId: null, deadlineAt: null, version: { increment: 1 } },
          });
          if (r.count === 0) return null;
          await tx.leadAssignment.create({ data: { workspaceId, leadId, fromUserId: userId, toUserId: null, kind: "ABSENCE", level: 0, reason } });
          return null;
        }

        const reason = `${why} · ${[...notes, target.note].join(" · ")}`;
        const r = await tx.lead.updateMany({
          where: { id: leadId, workspaceId, version: lead.version },
          data: {
            ownerId: target.user.id, assignedAt: now, deadlineAt: new Date(now.getTime() + cfg.ackWindowSeconds * 1000),
            escalationLevel: target.level === 1 ? 0 : target.level, ownerOnLeaveFlag: false, version: { increment: 1 },
          },
        });
        if (r.count === 0) return null;
        await tx.leadAssignment.create({
          data: { workspaceId, leadId, fromUserId: userId, toUserId: target.user.id, kind: "ABSENCE", level: 0, reason },
        });
        if (target.viaRotation) await tx.assignmentConfig.update({ where: { workspaceId }, data: { rrCursor: target.user.id } });
        return { contactId: lead.contactId, to: target.user, reason };
      });
      if (moved) {
        await afterHandover({
          workspaceId, leadId, contactId: moved.contactId, kind: "ABSENCE", fromName: person.name,
          toUserId: moved.to.id, toName: moved.to.name, reason: moved.reason, actorId: null, actorLabel: "System (absence)",
          alertTitle: `Lead moved to you (${person.name} is away)`,
        });
      }
    } catch (e) {
      console.error(`[absence] lead ${leadId} failed`, e);
    }
  }

  // Already acknowledged: they keep it, but a manager is shown that the owner is away.
  await prisma.lead.updateMany({
    where: { workspaceId, ownerId: userId, status: "ACKNOWLEDGED", ownerOnLeaveFlag: false },
    data: { ownerOnLeaveFlag: true, version: { increment: 1 } },
  });
}

/** Back to Available: their acknowledged leads are no longer "Owner away". */
export async function returnFromAbsence(input: { workspaceId: string; userId: string }): Promise<void> {
  await prisma.lead.updateMany({
    where: { workspaceId: input.workspaceId, ownerId: input.userId, ownerOnLeaveFlag: true },
    data: { ownerOnLeaveFlag: false, version: { increment: 1 } },
  });
}

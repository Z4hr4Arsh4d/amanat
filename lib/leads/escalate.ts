// P2 owns. Escalation chain (PLAN.md §3.5) — the most important code in P2.
// All state is in the DB. escalate() is safe to run in two workers at once: the conditional update
// on `version` lets exactly one of them win (F3.8, Q5).
import { prisma } from "@/lib/db";
import { ensureConfig, findTarget, levelsOf, loadBusy, loadCandidates, autoAssign } from "./assign";
import { afterHandover } from "./handover";

/** Returns true if THIS call moved the lead. */
export async function escalate(workspaceId: string, leadId: string, version: number): Promise<boolean> {
  const cfg0 = await ensureConfig(workspaceId);
  const candidates = await loadCandidates(workspaceId);
  const busy = await loadBusy(cfg0, candidates);

  const done = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "AssignmentConfig" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`;
    const cfg = await tx.assignmentConfig.findUniqueOrThrow({ where: { workspaceId } });
    const lead = await tx.lead.findFirst({ where: { id: leadId, workspaceId } });
    const now = new Date();
    if (!lead || lead.version !== version || lead.status !== "ASSIGNED" || !lead.ownerId) return null;
    if (!lead.deadlineAt || lead.deadlineAt > now) return null; // not due yet, or the chain already finished

    const levels = levelsOf(cfg);
    const past = await tx.leadAssignment.findMany({ where: { leadId, workspaceId, toUserId: { not: null } }, select: { toUserId: true } });
    const excludeIds = [...new Set([lead.ownerId, ...past.map((p) => p.toUserId as string)])];
    const from = candidates.find((c) => c.id === lead.ownerId) ?? (await tx.user.findFirst({ where: { id: lead.ownerId, workspaceId }, select: { id: true, name: true, status: true, timezone: true } }));
    const fromName = from?.name ?? "The owner";
    const prevSeconds = lead.escalationLevel > 0 ? (levels[lead.escalationLevel - 1]?.seconds ?? cfg.ackWindowSeconds) : cfg.ackWindowSeconds;
    const base = `${fromName} did not acknowledge within ${prevSeconds}s`;

    const { target, notes } = await findTarget(tx, workspaceId, cfg, candidates, busy, {
      excludeIds, currentOwnerId: lead.ownerId, startLevel: lead.escalationLevel + 1,
    });

    if (!target) {
      // Chain finished: keep it with the current holder (the manager), stop the timer, and let it show in recovery.
      const r = await tx.lead.updateMany({
        where: { id: leadId, workspaceId, version },
        data: { deadlineAt: null, escalationLevel: Math.max(lead.escalationLevel, levels.length) + 1, escalationCount: { increment: 1 }, version: { increment: 1 } },
      });
      if (r.count === 0) return null;
      const reason = `${base}. Nobody is left to escalate to, so it stays with ${fromName} and needs a manager${notes.length ? ` · ${notes.join(" · ")}` : ""}`;
      await tx.leadAssignment.create({
        data: { workspaceId, leadId, fromUserId: lead.ownerId, toUserId: lead.ownerId, kind: "ESCALATION", level: levels.length + 1, reason },
      });
      return { lead, kind: "end" as const, reason, fromName, toName: fromName, toId: lead.ownerId };
    }

    const r = await tx.lead.updateMany({
      where: { id: leadId, workspaceId, version },
      data: {
        ownerId: target.user.id, assignedAt: now, deadlineAt: new Date(now.getTime() + target.seconds * 1000),
        escalationLevel: target.level, escalationCount: { increment: 1 }, ownerOnLeaveFlag: false, version: { increment: 1 },
      },
    });
    if (r.count === 0) return null; // another worker already handled this lead
    const reason = `${base} (level ${target.level} of ${levels.length}) · ${[...notes, target.note].join(" · ")}`;
    await tx.leadAssignment.create({
      data: { workspaceId, leadId, fromUserId: lead.ownerId, toUserId: target.user.id, kind: "ESCALATION", level: target.level, reason },
    });
    if (target.viaRotation) await tx.assignmentConfig.update({ where: { workspaceId }, data: { rrCursor: target.user.id } });
    return { lead, kind: "moved" as const, reason, fromName, toName: target.user.name, toId: target.user.id };
  });

  if (!done) return false;
  await afterHandover({
    workspaceId, leadId, contactId: done.lead.contactId, kind: "ESCALATION",
    fromName: done.fromName, toUserId: done.toId, toName: done.toName, reason: done.reason, actorId: null,
    alertTitle: done.kind === "end" ? "Lead needs a manager" : "Lead escalated to you",
  });
  return true;
}

/** Worker job: escalate every lead whose acknowledge deadline has passed. Cheap and safe to run often. */
export async function escalationSweep(): Promise<void> {
  const due = await prisma.lead.findMany({
    where: { status: "ASSIGNED", deadlineAt: { lte: new Date() } },
    select: { id: true, workspaceId: true, version: true },
    orderBy: { deadlineAt: "asc" },
    take: 50,
  });
  for (const l of due) {
    try {
      await escalate(l.workspaceId, l.id, l.version);
    } catch (e) {
      console.error(`[escalation] lead ${l.id} failed`, e);
    }
  }

  // Leads that had nobody free get another try as soon as someone becomes available.
  const waiting = await prisma.lead.findMany({
    where: { status: "UNASSIGNED", ownerId: null },
    select: { id: true, workspaceId: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  for (const l of waiting) {
    try {
      await autoAssign(l.workspaceId, l.id, true);
    } catch (e) {
      console.error(`[escalation] retry of lead ${l.id} failed`, e);
    }
  }
}

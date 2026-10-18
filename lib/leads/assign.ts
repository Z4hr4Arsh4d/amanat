// P2 owns. Assignment engine (PLAN.md §3.3): who may take a lead, round-robin, and the routing reason.
// Used by intake and by the worker, so it takes a workspaceId and uses the raw client, scoped by hand.
// Imports modules directly (not contracts.ts) because contracts.ts pulls in server-only code the worker can't load.
import type { AssignmentConfig, Lead, Prisma, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import * as audit from "@/lib/audit";
import * as timeline from "@/lib/crm/timeline";
import { isBusyNow } from "@/lib/integrations/calendar";

export const STATUS_LABEL: Record<UserStatus, string> = {
  AVAILABLE: "Available", BUSY: "Busy", ON_LEAVE: "On leave", OFFLINE: "Offline",
};
export const SOURCE_LABEL = { WEB_FORM: "Web form", WHATSAPP: "WhatsApp", MANUAL: "Manual" } as const;

export type Candidate = { id: string; name: string; status: UserStatus; timezone: string };
export type Choice = { user: Candidate | null; reason: string };

export async function ensureConfig(workspaceId: string): Promise<AssignmentConfig> {
  return prisma.assignmentConfig.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} });
}

/** Everyone who could hold a lead, in a stable order (by id) so round-robin is predictable. */
export async function loadCandidates(workspaceId: string): Promise<Candidate[]> {
  return prisma.user.findMany({
    where: { workspaceId, isActive: true },
    select: { id: true, name: true, status: true, timezone: true },
    orderBy: { id: "asc" },
  });
}

/** Calendar meetings happening right now. Done before the transaction because it calls Google. */
export async function loadBusy(cfg: AssignmentConfig, candidates: Candidate[]): Promise<Map<string, Date>> {
  const busy = new Map<string, Date>();
  if (!cfg.useCalendarBusy) return busy;
  await Promise.all(
    candidates.filter((c) => c.status === "AVAILABLE").map(async (c) => {
      try {
        const b = await isBusyNow(c.id);
        if (b) busy.set(c.id, b.until);
      } catch {
        // A calendar problem must never stop a lead from being assigned (I5.8).
      }
    }),
  );
  return busy;
}

const clock = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(d);

/**
 * Walk the team in rotation order, starting after the last person who got a lead.
 * Every person passed over adds a "Skipped …" part, so the reason explains the whole decision.
 * Call inside a transaction that holds the config row lock.
 */
export async function chooseAssignee(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  cfg: AssignmentConfig,
  candidates: Candidate[],
  busy: Map<string, Date>,
  excludeIds: string[] = [],
): Promise<Choice> {
  const counts = await tx.lead.groupBy({
    by: ["ownerId"],
    where: { workspaceId, status: { in: ["ASSIGNED", "ACKNOWLEDGED"] }, ownerId: { not: null } },
    _count: { _all: true },
  });
  const open = new Map(counts.map((c) => [c.ownerId as string, c._count._all]));

  const start = candidates.findIndex((c) => cfg.rrCursor !== null && c.id > cfg.rrCursor);
  const ordered = start <= 0 ? candidates : [...candidates.slice(start), ...candidates.slice(0, start)];

  const parts: string[] = [];
  for (const c of ordered) {
    if (excludeIds.includes(c.id)) { parts.push(`Skipped ${c.name} (already had this lead)`); continue; }
    if (c.status !== "AVAILABLE") { parts.push(`Skipped ${c.name} (${STATUS_LABEL[c.status]})`); continue; }
    const n = open.get(c.id) ?? 0;
    if (n >= cfg.maxOpenLeads) { parts.push(`Skipped ${c.name} (${n}/${cfg.maxOpenLeads} open leads)`); continue; }
    const until = busy.get(c.id);
    if (until) { parts.push(`Skipped ${c.name} (in a meeting until ${clock(until, c.timezone)})`); continue; }
    parts.push(`Chose ${c.name} (next in rotation)`);
    return { user: c, reason: parts.join(" · ") };
  }
  return { user: null, reason: parts.length ? `Nobody is free. ${parts.join(" · ")}` : "Nobody is free. There are no active team members." };
}

/**
 * First assignment of a lead (kind AUTO). Safe to call twice: the second call finds the lead
 * already assigned (or changed by someone else) and does nothing. Returns the lead as it is now.
 */
export async function autoAssign(workspaceId: string, leadId: string): Promise<Lead | null> {
  const cfg0 = await ensureConfig(workspaceId);
  const candidates = await loadCandidates(workspaceId);
  const busy = await loadBusy(cfg0, candidates);

  const done = await prisma.$transaction(async (tx) => {
    // One assignment at a time per workspace, so two leads can't both get the same round-robin turn.
    await tx.$queryRaw`SELECT 1 FROM "AssignmentConfig" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`;
    const cfg = await tx.assignmentConfig.findUniqueOrThrow({ where: { workspaceId } });
    const lead = await tx.lead.findFirst({ where: { id: leadId, workspaceId }, include: { contact: { select: { name: true } } } });
    if (!lead || (lead.status !== "NEW" && lead.status !== "UNASSIGNED")) return null;

    const choice = await chooseAssignee(tx, workspaceId, cfg, candidates, busy);
    const now = new Date();

    if (!choice.user) {
      const r = await tx.lead.updateMany({
        where: { id: leadId, workspaceId, version: lead.version },
        data: { status: "UNASSIGNED", ownerId: null, deadlineAt: null, version: { increment: 1 } },
      });
      if (r.count === 0) return null; // someone else changed it first
      await tx.leadAssignment.create({ data: { workspaceId, leadId, kind: "AUTO", level: 0, reason: choice.reason } });
      return { lead, choice, owner: null as Candidate | null };
    }

    const owner = choice.user;
    const r = await tx.lead.updateMany({
      where: { id: leadId, workspaceId, version: lead.version },
      data: {
        ownerId: owner.id, status: "ASSIGNED", assignedAt: now,
        firstAssignedAt: lead.firstAssignedAt ?? now,
        deadlineAt: new Date(now.getTime() + cfg.ackWindowSeconds * 1000),
        version: { increment: 1 },
      },
    });
    if (r.count === 0) return null;
    await tx.leadAssignment.create({
      data: { workspaceId, leadId, fromUserId: null, toUserId: owner.id, kind: "AUTO", level: 0, reason: choice.reason },
    });
    await tx.assignmentConfig.update({ where: { workspaceId }, data: { rrCursor: owner.id } });
    await tx.notification.create({
      data: {
        workspaceId, userId: owner.id, leadId, channel: "INAPP", status: "SENT",
        title: "New lead assigned to you",
        body: `${lead.contact.name} (${SOURCE_LABEL[lead.source]}). Acknowledge within ${cfg.ackWindowSeconds}s.`,
      },
    });
    return { lead, choice, owner };
  });

  if (done) {
    const { lead, choice, owner } = done;
    await audit.record({
      workspaceId, actorId: null, actorLabel: "System (assignment)", action: "lead.assigned",
      targetType: "Lead", targetId: leadId, after: { ownerId: owner?.id ?? null, status: owner ? "ASSIGNED" : "UNASSIGNED", reason: choice.reason },
    });
    await timeline.add({
      workspaceId, actorId: null, type: "assignment", contactId: lead.contactId, leadId,
      summary: owner ? `Lead assigned to ${owner.name}. ${choice.reason}` : choice.reason,
    });
  }
  return prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
}

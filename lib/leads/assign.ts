// P2 owns. Assignment engine (PLAN.md §3.3): who may take a lead, round-robin, and the routing reason.
// Used by intake and by the worker, so it takes a workspaceId and uses the raw client, scoped by hand.
// Imports modules directly (not contracts.ts) because contracts.ts pulls in server-only code the worker can't load.
import type { AssignmentConfig, Lead, Prisma, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import * as audit from "@/lib/audit";
import * as timeline from "@/lib/crm/timeline";
import * as notify from "@/lib/notify";
import { isBusyNow } from "@/lib/integrations/calendar";

export const STATUS_LABEL: Record<UserStatus, string> = {
  AVAILABLE: "Available", BUSY: "Busy", ON_LEAVE: "On leave", OFFLINE: "Offline",
};
export const SOURCE_LABEL = { WEB_FORM: "Web form", WHATSAPP: "WhatsApp", MANUAL: "Manual" } as const;

/** Transactions here wait on a row lock and make several round trips, so give them more than the 5s default. */
export const TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 };

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
export async function autoAssign(workspaceId: string, leadId: string, quiet = false): Promise<Lead | null> {
  const cfg0 = await ensureConfig(workspaceId);
  const candidates = await loadCandidates(workspaceId);
  const busy = await loadBusy(cfg0, candidates);

  const done = await prisma.$transaction(async (tx) => {
    // One assignment at a time per workspace, so two leads can't both get the same round-robin turn.
    await tx.$queryRaw`SELECT 1 FROM "AssignmentConfig" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`;
    const cfg = await tx.assignmentConfig.findUniqueOrThrow({ where: { workspaceId } });
    const lead = await tx.lead.findFirst({ where: { id: leadId, workspaceId }, include: { contact: { select: { name: true } } } });
    if (!lead || (lead.status !== "NEW" && lead.status !== "UNASSIGNED")) return null;

    const rotation = await chooseAssignee(tx, workspaceId, cfg, candidates, busy);
    const now = new Date();
    let owner: Candidate | null = rotation.user;
    let level = 0;
    let seconds = cfg.ackWindowSeconds;
    let reason = rotation.reason;

    if (!owner) {
      // Nobody is free: go straight to the first Backup / Manager level instead of waiting (PLAN.md §3.3).
      const levels = levelsOf(cfg);
      const first = levels.findIndex((l) => l.type !== "NEXT_ELIGIBLE");
      if (first >= 0) {
        const f = await findTarget(tx, workspaceId, cfg, candidates, busy, { excludeIds: [], currentOwnerId: null, startLevel: first + 1 });
        if (f.target) {
          owner = f.target.user; level = f.target.level; seconds = f.target.seconds;
          reason = `${rotation.reason} · ${f.target.note}`;
        }
      }
    }

    if (!owner) {
      if (quiet) return null; // retry from the worker: stay silent while nobody is free
      const r = await tx.lead.updateMany({
        where: { id: leadId, workspaceId, version: lead.version },
        data: { status: "UNASSIGNED", ownerId: null, deadlineAt: null, version: { increment: 1 } },
      });
      if (r.count === 0) return null; // someone else changed it first
      await tx.leadAssignment.create({ data: { workspaceId, leadId, kind: "AUTO", level: 0, reason } });
      return { lead, choice: { user: null, reason } as Choice, owner: null as Candidate | null };
    }

    const r = await tx.lead.updateMany({
      where: { id: leadId, workspaceId, version: lead.version },
      data: {
        ownerId: owner.id, status: "ASSIGNED", assignedAt: now,
        firstAssignedAt: lead.firstAssignedAt ?? now,
        deadlineAt: new Date(now.getTime() + seconds * 1000),
        escalationLevel: level,
        version: { increment: 1 },
      },
    });
    if (r.count === 0) return null;
    await tx.leadAssignment.create({
      data: { workspaceId, leadId, fromUserId: null, toUserId: owner.id, kind: "AUTO", level, reason },
    });
    if (rotation.user) await tx.assignmentConfig.update({ where: { workspaceId }, data: { rrCursor: owner.id } });
    return { lead, choice: { user: owner, reason } as Choice, owner };
  }, TX_OPTIONS);

  if (done) {
    const { lead, choice, owner } = done;
    if (owner) {
      try {
        await notify.alert({ workspaceId, userId: owner.id, leadId, title: "New lead assigned to you", reason: choice.reason });
      } catch (e) {
        console.error("[assign] alert failed", e); // an alert problem must never undo an assignment
      }
    }
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

// ───────────── escalation levels (PLAN.md §3.5) ─────────────

export type Level = { type: "NEXT_ELIGIBLE" | "BACKUP" | "MANAGER"; seconds: number };

export function levelsOf(cfg: AssignmentConfig): Level[] {
  const raw = Array.isArray(cfg.levels) ? (cfg.levels as unknown[]) : [];
  return raw.filter((l): l is Level => {
    const x = l as Partial<Level> | null;
    return !!x && (x.type === "NEXT_ELIGIBLE" || x.type === "BACKUP" || x.type === "MANAGER") && typeof x.seconds === "number" && x.seconds > 0;
  });
}

export type Target = { user: Candidate; level: number; seconds: number; viaRotation: boolean; note: string };

/**
 * Starting at level `startLevel` (1-based), find who should hold the lead next.
 * A level nobody can fill is skipped (and mentioned in `notes`) so the chain keeps moving.
 * Call inside a transaction that holds the config row lock.
 */
export async function findTarget(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  cfg: AssignmentConfig,
  candidates: Candidate[],
  busy: Map<string, Date>,
  opts: { excludeIds: string[]; currentOwnerId: string | null; startLevel: number },
): Promise<{ target: Target | null; notes: string[] }> {
  const levels = levelsOf(cfg);
  const notes: string[] = [];
  for (let i = Math.max(0, opts.startLevel - 1); i < levels.length; i++) {
    const lvl = levels[i];
    if (lvl.type === "NEXT_ELIGIBLE") {
      const c = await chooseAssignee(tx, workspaceId, cfg, candidates, busy, opts.excludeIds);
      if (c.user) return { target: { user: c.user, level: i + 1, seconds: lvl.seconds, viaRotation: true, note: c.reason }, notes };
      notes.push(c.reason);
    } else if (lvl.type === "BACKUP") {
      const u = candidates.find((c) => c.id === cfg.backupUserId);
      if (u && !opts.excludeIds.includes(u.id)) {
        return { target: { user: u, level: i + 1, seconds: lvl.seconds, viaRotation: false, note: `Sent to the backup person, ${u.name}` }, notes };
      }
      notes.push(u ? `Backup ${u.name} already had this lead` : "No backup person is set");
    } else {
      const m = candidates.find((c) => c.id === cfg.managerUserId);
      if (m && m.id !== opts.currentOwnerId) {
        return { target: { user: m, level: i + 1, seconds: lvl.seconds, viaRotation: false, note: `Sent to the manager, ${m.name}` }, notes };
      }
      notes.push(m ? `Manager ${m.name} already has this lead` : "No manager is set");
    }
  }
  return { target: null, notes };
}

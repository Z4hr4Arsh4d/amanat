// P2 owns. THE ONLY PLACE dashboard figures are computed (F5.2, Q12, Section 7 definitions).
// Lists and drill-downs must call the same functions so numbers always match.
// Uses the raw client with workspaceId set by hand, so the worker and server actions can both call it.
import type { LeadSource, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type Scope = { workspaceId: string; userId?: string }; // userId set → personal figures (F5.4)

const ownerFilter = (s: Scope): Prisma.LeadWhereInput => (s.userId ? { ownerId: s.userId } : {});

export * from "./figures";

// ───────────── Recovery queue (F3.7) ─────────────

export type RecoveryReason = { kind: "overdue" | "unassigned" | "new" | "escalated" | "idle" | "away"; text: string };

export type RecoveryItem = {
  leadId: string; reason: string; reasons: RecoveryReason[];
  contactId: string; contactName: string; source: LeadSource; status: LeadStatus;
  ownerId: string | null; ownerName: string | null; escalationCount: number; createdAt: Date;
};

const span = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
};

/** Leads that need a person to step in. One query, used by /recovery and the dashboard count. */
export async function recoveryQueue(s: Scope): Promise<RecoveryItem[]> {
  const cfg = await prisma.assignmentConfig.findUnique({ where: { workspaceId: s.workspaceId }, select: { idleSeconds: true } });
  const idleMs = (cfg?.idleSeconds ?? 300) * 1000;
  const now = Date.now();
  const idleCut = new Date(now - idleMs);
  const nowDate = new Date(now);

  const leads = await prisma.lead.findMany({
    where: {
      workspaceId: s.workspaceId, status: { not: "CLOSED" }, ...ownerFilter(s),
      OR: [
        { status: "ASSIGNED", OR: [{ deadlineAt: { lt: nowDate } }, { deadlineAt: null }] },
        { status: "UNASSIGNED" },
        { status: "NEW", createdAt: { lt: new Date(now - 30_000) } },
        { escalationCount: { gte: 2 } },
        { ownerOnLeaveFlag: true },
        { lastActionAt: { lt: idleCut } },
        { lastActionAt: null, createdAt: { lt: idleCut } },
      ],
    },
    include: { contact: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const ownerIds = [...new Set(leads.map((l) => l.ownerId).filter((x): x is string => !!x))];
  const owners = await prisma.user.findMany({ where: { workspaceId: s.workspaceId, id: { in: ownerIds } }, select: { id: true, name: true } });
  const name = new Map(owners.map((o) => [o.id, o.name]));

  return leads.map((l) => {
    const reasons: RecoveryReason[] = [];
    if (l.status === "ASSIGNED" && (!l.deadlineAt || l.deadlineAt.getTime() < now)) {
      reasons.push({
        kind: "overdue",
        text: l.deadlineAt ? `Unacknowledged ${span(now - l.deadlineAt.getTime())} past window` : "Unacknowledged, escalation finished",
      });
    }
    if (l.status === "UNASSIGNED") reasons.push({ kind: "unassigned", text: "Nobody is assigned" });
    if (l.status === "NEW") reasons.push({ kind: "new", text: "Not assigned yet" });
    if (l.escalationCount >= 2) reasons.push({ kind: "escalated", text: `Escalated ${l.escalationCount} times` });
    const last = (l.lastActionAt ?? l.createdAt).getTime();
    if (now - last > idleMs) reasons.push({ kind: "idle", text: `No action for ${span(now - last)}` });
    if (l.ownerOnLeaveFlag) reasons.push({ kind: "away", text: "Owner on leave" });
    return {
      leadId: l.id, reason: reasons[0]?.text ?? "Needs attention", reasons,
      contactId: l.contactId, contactName: l.contact.name, source: l.source, status: l.status,
      ownerId: l.ownerId, ownerName: l.ownerId ? (name.get(l.ownerId) ?? null) : null,
      escalationCount: l.escalationCount, createdAt: l.createdAt,
    };
  });
}

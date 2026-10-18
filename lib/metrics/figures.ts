// P2 owns. Dashboard figures (F5.1–F5.5, Q12). Re-exported from lib/metrics/index.ts, which is the public entry point.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { collected } from "@/lib/integrations/payments";
import type { Scope } from "./index";

const ownerFilter = (s: Scope): Prisma.LeadWhereInput => (s.userId ? { ownerId: s.userId } : {});

// ───────────── Time helpers (workspace timezone) ─────────────

/** Wall-clock time in `tz`, read as if it were UTC. Subtracting the real instant gives the zone's offset. */
function wallClock(d: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(d).map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** The real instant at which `y-m-d 00:00` happens in `tz`. */
function midnightIn(tz: string, y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m, d));
  return new Date(guess.getTime() - (wallClock(guess, tz) - guess.getTime()));
}

export function dayStart(tz: string, now = new Date()): Date {
  const w = new Date(wallClock(now, tz));
  return midnightIn(tz, w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
}

export function monthRange(tz: string, now = new Date()): { from: Date; to: Date } {
  const w = new Date(wallClock(now, tz));
  return { from: midnightIn(tz, w.getUTCFullYear(), w.getUTCMonth(), 1), to: midnightIn(tz, w.getUTCFullYear(), w.getUTCMonth() + 1, 1) };
}

async function workspaceTz(workspaceId: string): Promise<string> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
  return ws?.timezone ?? "Asia/Karachi";
}

// ───────────── Lead figures (F5.1, F5.3) ─────────────
// The dashboard tile and the list behind it call the SAME where-builder, so the numbers always match (Q12).

export type LeadFilterName = "today" | "escalated24h";
export const LEAD_FILTERS: Record<LeadFilterName, string> = { today: "New leads today", escalated24h: "Escalated in the last 24 hours" };

export async function leadFilterWhere(s: Scope, filter: LeadFilterName): Promise<Prisma.LeadWhereInput> {
  const base: Prisma.LeadWhereInput = { workspaceId: s.workspaceId, ...ownerFilter(s) };
  if (filter === "today") return { ...base, createdAt: { gte: dayStart(await workspaceTz(s.workspaceId)) } };
  return { ...base, assignments: { some: { kind: "ESCALATION", createdAt: { gte: new Date(Date.now() - 864e5) } } } };
}

/** New leads today = leads created since the start of today in the workspace timezone. */
export async function newLeadsToday(s: Scope): Promise<number> {
  return prisma.lead.count({ where: await leadFilterWhere(s, "today") });
}

/** Escalations in the last 24h = LeadAssignment rows of kind ESCALATION. Manual reassigns are counted apart. */
export async function escalationsLast24h(s: Scope): Promise<{ escalations: number; manual: number }> {
  const since = new Date(Date.now() - 864e5);
  const mine: Prisma.LeadAssignmentWhereInput = s.userId ? { OR: [{ toUserId: s.userId }, { fromUserId: s.userId }] } : {};
  const [escalations, manual] = await Promise.all([
    prisma.leadAssignment.count({ where: { workspaceId: s.workspaceId, kind: "ESCALATION", createdAt: { gte: since }, ...mine } }),
    prisma.leadAssignment.count({ where: { workspaceId: s.workspaceId, kind: "MANUAL", createdAt: { gte: since }, ...mine } }),
  ]);
  return { escalations, manual };
}

/** Average time to first response = mean(firstAcknowledgedAt − firstAssignedAt) over leads acknowledged in the last 7 days. */
export async function avgFirstResponseSeconds(s: Scope, days = 7): Promise<number | null> {
  const rows = await prisma.lead.findMany({
    where: { workspaceId: s.workspaceId, ...ownerFilter(s), firstAcknowledgedAt: { gte: new Date(Date.now() - days * 864e5) }, firstAssignedAt: { not: null } },
    select: { firstAcknowledgedAt: true, firstAssignedAt: true }, take: 5000,
  });
  const gaps = rows.map((r) => ((r.firstAcknowledgedAt as Date).getTime() - (r.firstAssignedAt as Date).getTime()) / 1000).filter((g) => g >= 0);
  return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
}

// ───────────── Pipeline and revenue ─────────────

export type StageValue = { stageId: string; stage: string; currency: string; count: number; value: number | null };

/** Open pipeline value by stage = sum of opportunity value where the stage kind is OPEN. Value is null when masked. */
export async function openPipelineByStage(s: Scope, canSeeValue: boolean): Promise<StageValue[]> {
  const groups = await prisma.opportunity.groupBy({
    by: ["stageId", "currency"],
    where: { workspaceId: s.workspaceId, deletedAt: null, stage: { kind: "OPEN" }, ...(s.userId ? { ownerId: s.userId } : {}) },
    _sum: { value: true }, _count: { _all: true },
  });
  const stages = await prisma.stage.findMany({ where: { workspaceId: s.workspaceId, id: { in: groups.map((g) => g.stageId) } }, select: { id: true, name: true, order: true } });
  const info = new Map(stages.map((x) => [x.id, x]));
  return groups
    .sort((a, b) => (info.get(a.stageId)?.order ?? 0) - (info.get(b.stageId)?.order ?? 0))
    .map((g) => ({ stageId: g.stageId, stage: info.get(g.stageId)?.name ?? "Stage", currency: g.currency, count: g._count._all, value: canSeeValue ? Number(g._sum.value ?? 0) : null }));
}

/** Revenue at risk (extra figure) = open opportunity value of contacts whose lead is past its deadline or unassigned. */
export async function revenueAtRisk(s: Scope, canSeeValue: boolean): Promise<{ count: number; value: number | null; currency: string }> {
  const now = new Date();
  const leads = await prisma.lead.findMany({
    where: {
      workspaceId: s.workspaceId, ...ownerFilter(s),
      OR: [{ status: "UNASSIGNED" }, { status: "ASSIGNED", OR: [{ deadlineAt: { lt: now } }, { deadlineAt: null }] }],
    },
    select: { contactId: true }, take: 1000,
  });
  const contactIds = [...new Set(leads.map((l) => l.contactId))];
  if (contactIds.length === 0) return { count: 0, value: canSeeValue ? 0 : null, currency: "PKR" };
  const agg = await prisma.opportunity.aggregate({
    where: { workspaceId: s.workspaceId, deletedAt: null, contactId: { in: contactIds }, stage: { kind: "OPEN" } },
    _sum: { value: true },
  });
  return { count: contactIds.length, value: canSeeValue ? Number(agg._sum.value ?? 0) : null, currency: "PKR" };
}

// ───────────── Team, calendar, payments ─────────────

export async function employeeAvailability(s: Scope) {
  const users = await prisma.user.findMany({
    where: { workspaceId: s.workspaceId, isActive: true, ...(s.userId ? { id: s.userId } : {}) },
    select: { name: true, status: true }, orderBy: { name: "asc" },
  });
  const counts = { AVAILABLE: 0, BUSY: 0, ON_LEAVE: 0, OFFLINE: 0 };
  for (const u of users) counts[u.status]++;
  return { counts, people: users };
}

export async function upcomingAppointments(s: Scope) {
  const now = new Date();
  const where: Prisma.AppointmentWhereInput = {
    workspaceId: s.workspaceId, status: { in: ["BOOKED", "RESCHEDULED"] },
    startUtc: { gt: now, lt: new Date(now.getTime() + 7 * 864e5) }, ...(s.userId ? { userId: s.userId } : {}),
  };
  const [count, next] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({ where, orderBy: { startUtc: "asc" }, take: 3, select: { id: true, title: true, startUtc: true, timezone: true } }),
  ]);
  return { count, next };
}

/** Payments received this month = payments.collected (paid minus refunds, from P3), converted from minor units. */
export async function paymentsThisMonth(s: Scope): Promise<number> {
  const { from, to } = monthRange(await workspaceTz(s.workspaceId));
  return (await collected(s.workspaceId, from, to, s.userId)) / 100;
}

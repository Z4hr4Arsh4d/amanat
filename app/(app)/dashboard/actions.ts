"use server";
// P2 owns. Dashboard data (F5.1–F5.5). Every figure comes from lib/metrics, nowhere else (Q12).
import { z } from "zod";
import { requireUser, requirePermission } from "@/lib/core/session";
import { act } from "@/lib/core/action";
import { prisma } from "@/lib/db";
import * as m from "@/lib/metrics";
import { TILES } from "./tiles";

const TileId = z.enum(TILES.map((t) => t.id) as [string, ...string[]], "Unknown dashboard tile.");

export type DashboardData = {
  company: boolean; hidden: string[];
  newLeads: number;
  pipeline: m.StageValue[];
  firstResponseSeconds: number | null;
  recovery: number;
  escalations: { escalations: number; manual: number };
  availability: Awaited<ReturnType<typeof m.employeeAvailability>>;
  appointments: { count: number; next: { id: string; title: string; startUtc: string; timezone: string }[] };
  payments: number;
  atRisk: { count: number; value: number | null; currency: string };
};

export async function getDashboard() {
  return act(async (): Promise<DashboardData> => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    // Without company-wide access every figure is limited to this person (F5.4).
    const company = ctx.permissions.has("dashboard.company");
    const s: m.Scope = company ? { workspaceId: ctx.workspaceId } : { workspaceId: ctx.workspaceId, userId: ctx.userId };
    const canSeeValue = ctx.permissions.has("opportunity.value.view");

    const [newLeads, pipeline, firstResponseSeconds, queue, escalations, availability, appts, payments, atRisk, pref] = await Promise.all([
      m.newLeadsToday(s), m.openPipelineByStage(s, canSeeValue), m.avgFirstResponseSeconds(s), m.recoveryQueue(s),
      m.escalationsLast24h(s), m.employeeAvailability(s), m.upcomingAppointments(s), m.paymentsThisMonth(s), m.revenueAtRisk(s, canSeeValue),
      prisma.dashboardPref.findUnique({ where: { userId: ctx.userId } }),
    ]);
    return {
      company, hidden: pref?.hiddenTiles ?? [], newLeads, pipeline, firstResponseSeconds, recovery: queue.length, escalations, availability,
      appointments: { count: appts.count, next: appts.next.map((a) => ({ id: a.id, title: a.title, startUtc: a.startUtc.toISOString(), timezone: a.timezone })) },
      payments, atRisk,
    };
  });
}

export async function saveDashboardPrefs(input: { hiddenTiles: string[] }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const hiddenTiles = [...new Set(z.array(TileId).max(TILES.length).parse(input.hiddenTiles))];
    // DashboardPref belongs to the logged-in user and is keyed by their id, so no other person's setting can be touched.
    await prisma.dashboardPref.upsert({ where: { userId: ctx.userId }, create: { userId: ctx.userId, hiddenTiles }, update: { hiddenTiles } });
    return null;
  });
}

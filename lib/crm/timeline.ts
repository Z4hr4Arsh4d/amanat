// P1 owns. Signature of add() is a CONTRACT — everyone calls it to put something on a contact's /
// opportunity's history (F2.7). Uses the raw client so the worker and webhooks can call it too.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type TimelineType =
  | "note" | "stage_change" | "assignment" | "field_edit" | "message" | "payment"
  | "appointment" | "lead_created" | "escalation" | "acknowledged" | "opt_out";

export type TimelineInput = {
  workspaceId: string;
  actorId: string | null; // null = system
  type: TimelineType;
  summary: string; // human sentence, e.g. "Payment of PKR 50,000 received"
  contactId?: string | null;
  opportunityId?: string | null;
  leadId?: string | null;
  data?: Prisma.InputJsonValue;
};

export async function add(input: TimelineInput): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        workspaceId: input.workspaceId, actorId: input.actorId, type: input.type, summary: input.summary.slice(0, 2000),
        contactId: input.contactId ?? null, opportunityId: input.opportunityId ?? null, leadId: input.leadId ?? null,
        data: input.data ?? {},
      },
    });
  } catch (e) {
    console.error("[timeline] could not add entry", e); // history must never break the action that caused it
  }
}

export type TimelineEntry = { id: string; type: string; summary: string; who: string; at: string; data: unknown };

/** Newest first, with who and when (F2.8). Workspace-scoped by hand. */
export async function list(workspaceId: string, where: { contactId?: string; opportunityId?: string }, take = 100): Promise<TimelineEntry[]> {
  const rows = await prisma.activity.findMany({
    where: { workspaceId, ...where },
    orderBy: { createdAt: "desc" },
    take,
  });
  const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id, type: r.type, summary: r.summary, data: r.data,
    who: r.actorId ? names.get(r.actorId) ?? "Former user" : "System",
    at: r.createdAt.toISOString(),
  }));
}

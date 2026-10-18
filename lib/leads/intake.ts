// P2 owns. Lead intake (PLAN.md §3.1): create the lead, record it, then assign it straight away.
import type { Lead, LeadSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import * as audit from "@/lib/audit";
import * as timeline from "@/lib/crm/timeline";
import { NotFound } from "@/lib/core/errors";
import { SOURCE_LABEL, autoAssign } from "./assign";

export async function intake(input: { workspaceId: string; contactId: string; source: LeadSource; actorId?: string | null }): Promise<Lead> {
  const { workspaceId, contactId, source } = input;
  const actorId = input.actorId ?? null;

  // The contact must belong to this workspace; anything else looks like it doesn't exist (F1.6).
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId, deletedAt: null }, select: { id: true, name: true } });
  if (!contact) throw NotFound();

  const lead = await prisma.lead.create({ data: { workspaceId, contactId, source } });

  await timeline.add({
    workspaceId, actorId, type: "lead_created", contactId, leadId: lead.id,
    summary: `New lead from ${SOURCE_LABEL[source]}`,
  });
  await audit.record({
    workspaceId, actorId, actorLabel: actorId ? undefined : "System (intake)", action: "lead.created",
    targetType: "Lead", targetId: lead.id, after: { contactId, source },
  });

  try {
    return (await autoAssign(workspaceId, lead.id)) ?? lead;
  } catch (e) {
    // The lead is saved even if assignment fails; it stays NEW so it is not lost.
    console.error("[leads.intake] assignment failed", e);
    return lead;
  }
}

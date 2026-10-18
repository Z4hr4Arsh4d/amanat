// P2 owns. Acknowledgement (PLAN.md §3.4): the current owner confirms they have the lead, which stops the countdown.
import { prisma } from "@/lib/db";
import * as audit from "@/lib/audit";
import * as timeline from "@/lib/crm/timeline";

export type AckResult = { ok: boolean; message: string };

/** Only the current owner can acknowledge. Safe to click twice or to race with an escalation. */
export async function acknowledge(input: { workspaceId: string; leadId: string; userId: string }): Promise<AckResult> {
  const { workspaceId, leadId, userId } = input;

  for (let attempt = 0; attempt < 2; attempt++) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) return { ok: false, message: "We could not find that lead." };
    if (lead.status === "CLOSED") return { ok: false, message: "This lead is closed." };

    if (lead.ownerId !== userId) {
      const owner = lead.ownerId ? await prisma.user.findFirst({ where: { id: lead.ownerId, workspaceId }, select: { name: true } }) : null;
      return { ok: false, message: owner ? `This lead has moved to ${owner.name}.` : "This lead is not assigned to you." };
    }
    if (lead.status === "ACKNOWLEDGED") return { ok: true, message: "You already acknowledged this lead." };
    if (lead.status !== "ASSIGNED") return { ok: false, message: "This lead is not waiting for a reply." };

    const now = new Date();
    const r = await prisma.lead.updateMany({
      where: { id: leadId, workspaceId, version: lead.version, ownerId: userId, status: "ASSIGNED" },
      data: {
        status: "ACKNOWLEDGED", acknowledgedAt: now, firstAcknowledgedAt: lead.firstAcknowledgedAt ?? now,
        lastActionAt: now, deadlineAt: null, version: { increment: 1 },
      },
    });
    if (r.count === 0) continue; // changed under us (e.g. escalated): look again and report what happened

    const user = await prisma.user.findFirst({ where: { id: userId, workspaceId }, select: { name: true } });
    await audit.record({
      workspaceId, actorId: userId, actorLabel: user?.name, action: "lead.acknowledged",
      targetType: "Lead", targetId: leadId, before: { status: "ASSIGNED" }, after: { status: "ACKNOWLEDGED" },
    });
    await timeline.add({
      workspaceId, actorId: userId, type: "acknowledged", contactId: lead.contactId, leadId,
      summary: `${user?.name ?? "The owner"} acknowledged the lead`,
    });
    return { ok: true, message: "Lead acknowledged." };
  }
  return { ok: false, message: "This lead just changed. Reload and try again." };
}

/**
 * Any recorded action on a contact counts as acknowledging that user's waiting lead (F3.4),
 * and always refreshes lastActionAt on their open leads for that contact.
 */
export async function markActed(input: { workspaceId: string; contactId: string; userId: string; action: string }): Promise<void> {
  const { workspaceId, contactId, userId } = input;
  const open = await prisma.lead.findMany({
    where: { workspaceId, contactId, ownerId: userId, status: { in: ["ASSIGNED", "ACKNOWLEDGED"] } },
    select: { id: true, status: true },
  });
  for (const l of open) {
    if (l.status === "ASSIGNED") await acknowledge({ workspaceId, leadId: l.id, userId });
  }
  await prisma.lead.updateMany({
    where: { workspaceId, contactId, ownerId: userId, status: { in: ["ASSIGNED", "ACKNOWLEDGED"] } },
    data: { lastActionAt: new Date() },
  });
}

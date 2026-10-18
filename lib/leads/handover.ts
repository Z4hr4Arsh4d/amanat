// P2 owns. What happens after a lead changes hands: audit, timeline, alert the new owner, tell the customer.
// Alerts and customer messages are best-effort: a Telegram or WhatsApp failure must never undo or block a handover (I5.8).
import * as audit from "@/lib/audit";
import * as timeline from "@/lib/crm/timeline";
import * as notify from "@/lib/notify";

export type Handover = {
  workspaceId: string; leadId: string; contactId: string;
  kind: "ESCALATION" | "MANUAL" | "ABSENCE";
  fromName: string | null; toUserId: string; toName: string;
  reason: string; actorId: string | null; actorLabel?: string;
  alertTitle: string;
};

const AUDIT_ACTION = { ESCALATION: "lead.escalated", MANUAL: "lead.reassigned", ABSENCE: "lead.reassigned" } as const;
const TIMELINE_TYPE = { ESCALATION: "escalation", MANUAL: "assignment", ABSENCE: "assignment" } as const;

export async function afterHandover(h: Handover): Promise<void> {
  await audit.record({
    workspaceId: h.workspaceId, actorId: h.actorId, actorLabel: h.actorLabel ?? "System (escalation worker)",
    action: AUDIT_ACTION[h.kind], targetType: "Lead", targetId: h.leadId,
    before: { owner: h.fromName }, after: { owner: h.toName, kind: h.kind, reason: h.reason },
  });
  await timeline.add({
    workspaceId: h.workspaceId, actorId: h.actorId, type: TIMELINE_TYPE[h.kind], contactId: h.contactId, leadId: h.leadId,
    summary: `${h.reason}. Now with ${h.toName}.`,
  });
  try {
    await notify.alert({ workspaceId: h.workspaceId, userId: h.toUserId, leadId: h.leadId, title: h.alertTitle, reason: h.reason });
  } catch (e) {
    console.error("[handover] alert failed", e);
  }
  try {
    // Loaded on demand: messaging.ts imports contracts.ts -> server-only session code, which must not be
    // loaded when the worker starts (it would crash the worker before any job runs).
    const messaging = await import("@/lib/integrations/messaging");
    await messaging.notifyHandoff({ workspaceId: h.workspaceId, contactId: h.contactId, newOwnerName: h.toName });
  } catch (e) {
    console.error("[handover] customer message failed", e);
  }
}

"use server";
// P2 owns. Recovery queue data (F3.7). Same function as the dashboard count (Q12).
import { requireUser, requirePermission } from "@/lib/core/session";
import { act } from "@/lib/core/action";
import { recoveryQueue } from "@/lib/metrics";

export type RecoveryRow = {
  leadId: string; contactId: string; contactName: string; source: "WEB_FORM" | "WHATSAPP" | "MANUAL";
  ownerName: string | null; reasons: { kind: string; text: string }[];
};

export async function listRecovery() {
  return act(async (): Promise<RecoveryRow[]> => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    // People without company-wide access only see their own leads (F5.4).
    const items = await recoveryQueue({ workspaceId: ctx.workspaceId, userId: ctx.permissions.has("dashboard.company") ? undefined : ctx.userId });
    return items.map((i) => ({
      leadId: i.leadId, contactId: i.contactId, contactName: i.contactName, source: i.source, ownerName: i.ownerName,
      reasons: i.reasons,
    }));
  });
}

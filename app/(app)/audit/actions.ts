"use server";
// P1 owns. F4.2 "Verify history".
import { requireUser, requirePermission } from "@/lib/core/session";
import { act } from "@/lib/core/action";
import { verifyChain } from "@/lib/audit";

export async function verifyAudit() {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "audit.view");
    return verifyChain(ctx.workspaceId);
  });
}

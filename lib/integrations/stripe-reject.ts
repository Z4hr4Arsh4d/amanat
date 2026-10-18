// P3 owns. A Stripe webhook that failed verification: 400, logged as REJECTED, audited. No data changed.
import type { Integration } from "@prisma/client";
import { audit } from "@/lib/shared/contracts";
import { logEvent } from "./log";

export async function rejectStripe(i: Integration, why: string, bytes: number) {
  await logEvent({ workspaceId: i.workspaceId, provider: "STRIPE", direction: "IN", type: "webhook", status: "REJECTED", error: `${why}. The request was ignored.`, payload: { bytes } });
  await audit.record({ workspaceId: i.workspaceId, actorId: null, actorLabel: "System (Stripe webhook)", action: "integration.webhook_rejected", targetType: "Integration", targetId: i.id, after: { provider: "STRIPE", reason: why } });
  return new Response(why, { status: 400 });
}

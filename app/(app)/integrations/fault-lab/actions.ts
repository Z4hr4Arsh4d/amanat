"use server";
// P3 owns. Fault lab actions (Owner + DEMO_MODE only; checked again in lib/integrations/fault.ts).
import { requireUser } from "@/lib/shared/contracts";
import { safe, type ActionResult } from "@/lib/integrations/action";
import * as fault from "@/lib/integrations/fault";

type Steps = { label: string; status: number; body: string }[];

export async function faultAction(kind: unknown): Promise<ActionResult<Steps>> {
  return safe<Steps>(async () => {
    const ctx = await requireUser();
    const steps = kind === "stripe" ? await fault.stripeTwice(ctx) : kind === "forged" ? await fault.forgedWhatsApp(ctx) : kind === "outage" ? await fault.outage(ctx) : null;
    if (!steps) return { ok: false, error: "Unknown test." };
    return { ok: true, message: "Test sent. See the results below and in the sync history.", data: steps };
  });
}

"use server";
// P3 owns. Payment actions. Permission + visibility are checked in lib/integrations/payments.ts.
import { z } from "zod";
import { requireUser } from "@/lib/shared/contracts";
import { safe, type ActionResult } from "@/lib/integrations/action";
import * as payments from "@/lib/integrations/payments";

const Id = z.string().min(1).max(40);

export async function createPaymentAction(input: unknown): Promise<ActionResult<{ id: string; url: string }>> {
  return safe<{ id: string; url: string }>(async () => {
    const ctx = await requireUser();
    const r = await payments.createRequest(ctx, input);
    return { ok: true, message: r.message, data: { id: r.payment.id, url: r.payment.url } };
  });
}

export async function sendPaymentLinkAction(paymentId: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await payments.sendLinkOnWhatsApp(ctx, Id.parse(paymentId));
    return r.ok ? { ok: true, message: r.error ? `Link queued on WhatsApp: ${r.error}` : "Payment link sent on WhatsApp." } : { ok: false, error: r.error ?? "Could not send on WhatsApp." };
  });
}

export async function expirePaymentAction(paymentId: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await payments.expireRequest(ctx, Id.parse(paymentId));
    return { ok: true, message: r.message };
  });
}

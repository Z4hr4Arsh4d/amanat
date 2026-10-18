"use server";
// P3 owns. Server actions for the Integrations page. Next.js checks the Origin of server actions (CSRF).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/shared/contracts";
import { safe, type ActionResult } from "@/lib/integrations/action";
import * as manage from "@/lib/integrations/manage";

const ProviderSchema = z.enum(["TWILIO", "STRIPE", "GOOGLE", "TELEGRAM"], { message: "Unknown integration." });

export async function saveTwilioAction(input: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await manage.saveTwilio(ctx, input);
    revalidatePath("/integrations");
    return r;
  });
}

export async function saveStripeAction(input: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await manage.saveStripe(ctx, input);
    revalidatePath("/integrations");
    return r;
  });
}

export async function prepareWebhookAction(provider: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    await manage.ensureRow(ctx, ProviderSchema.parse(provider));
    revalidatePath("/integrations");
    return { ok: true, message: "Webhook URL created. Copy it into the provider's settings." };
  });
}

export async function disconnectAction(provider: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await manage.disconnect(ctx, ProviderSchema.parse(provider));
    revalidatePath("/integrations");
    return r;
  });
}

export async function testConnectionAction(provider: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const p = z.enum(["TWILIO", "STRIPE"]).parse(provider);
    const r = await manage.testConnection(ctx, p);
    revalidatePath("/integrations");
    return r;
  });
}

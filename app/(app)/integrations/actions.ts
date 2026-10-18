"use server";
// P3 owns. Server actions for the Integrations page. Next.js checks the Origin of server actions (CSRF).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission, scoped } from "@/lib/shared/contracts";
import { NotFound } from "@/lib/core/errors";
import * as messaging from "@/lib/integrations/messaging";
import * as outbox from "@/lib/integrations/outbox";
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

/** Retry one failed outgoing call from the sync history (e.g. a failed Telegram alert, I4.4). */
export async function retryEventAction(eventId: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "integrations.manage");
    const id = z.string().min(1).max(40).parse(eventId);
    const ev = await scoped(ctx).integrationEvent.findFirst({ where: { id } });
    if (!ev) throw NotFound();
    if (ev.type === "twilio.message" && typeof (ev.payload as { messageId?: unknown })?.messageId === "string") {
      const r = await messaging.retry({ workspaceId: ctx.workspaceId, messageId: (ev.payload as { messageId: string }).messageId, userId: ctx.userId });
      return r.ok ? { ok: true, message: r.error ? `Retrying: ${r.error}` : "Sent again." } : { ok: false, error: r.error ?? "Retry failed." };
    }
    const r = await outbox.retryNow(ev.id, ctx.workspaceId);
    return r.ok ? { ok: true, message: "Sent again." } : { ok: false, error: r.error ?? "Retry failed." };
  });
}

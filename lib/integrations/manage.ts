// P3 owns. Connect / edit / disconnect integrations from the Integrations page (I5.1, I5.3, I5.7).
// Every function: requireUser → requirePermission("integrations.manage") → scoped(ctx) → audit.
import { z } from "zod";
import type { Provider } from "@prisma/client";
import { audit, requirePermission, scoped, type Ctx } from "@/lib/shared/contracts";
import { classify } from "./errors";
import { logEvent } from "./log";
import { withTimeout } from "./outbox";
import { encryptJson, mask } from "./secrets";
import { readSecrets, type MetaConfig, type MetaSecrets, type StripeSecrets, type TwilioConfig, type TwilioSecrets } from "./store";
import { verifyMetaCredentials } from "./meta";
import { verifyTwilioCredentials } from "./twilio";
import { verifyStripeKey } from "./stripe";
import { toE164 } from "./phone";
import type { ActionResult } from "./action";

export const TwilioForm = z.object({
  accountSid: z.string().trim().regex(/^AC[0-9a-fA-F]{32}$/, "Account SID starts with AC and has 34 characters. Copy it from the Twilio console home page."),
  authToken: z.union([z.literal(""), z.string().trim().regex(/^[0-9a-fA-F]{32}$/, "Auth Token has 32 letters and numbers. Copy it from the Twilio console home page.")]),
  fromNumber: z
    .string()
    .trim()
    .transform((s) => toE164(s))
    .refine((s): s is string => !!s, "Enter the sandbox number with country code, e.g. whatsapp:+14155238886."),
  joinCode: z.string().trim().max(60, "The join phrase is too long.").optional().default(""),
});

export const StripeForm = z.object({
  secretKey: z.union([
    z.literal(""),
    z
      .string()
      .trim()
      .refine((s) => !s.startsWith("sk_live_") && !s.startsWith("rk_live_"), "Live keys are not allowed. Use a test-mode key that starts with sk_test_.")
      .refine((s) => /^(sk|rk)_test_[A-Za-z0-9]{10,}$/.test(s), "The secret key must start with sk_test_. Copy it from Stripe → Developers → API keys (test mode)."),
  ]),
  webhookSecret: z.union([
    z.literal(""),
    z.string().trim().regex(/^whsec_[A-Za-z0-9]{10,}$/, "The signing secret starts with whsec_. Copy it from the webhook endpoint in Stripe."),
  ]),
});

const provName = (p: Provider) =>
  p === "TWILIO" ? "Twilio WhatsApp" : p === "META" ? "WhatsApp (Meta)" : p === "STRIPE" ? "Stripe" : p === "GOOGLE" ? "Google Calendar" : "Telegram";

export const MetaForm = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{8,20}$/, "Phone number ID is a long number. Copy it from Meta app → WhatsApp → API Setup."),
  wabaId: z.union([z.literal(""), z.string().trim().regex(/^\d{8,20}$/, "WhatsApp Business Account ID is a long number (API Setup page).")]).optional().default(""),
  accessToken: z.union([z.literal(""), z.string().trim().regex(/^EA[A-Za-z0-9]{40,}$/, "The access token starts with EA and is very long. Copy it from API Setup (or a System User token).")]),
  appSecret: z.union([z.literal(""), z.string().trim().regex(/^[0-9a-fA-F]{32}$/, "The App secret has 32 letters and numbers. Find it in Meta app → App settings → Basic.")]),
});

export async function saveMeta(ctx: Ctx, input: unknown): Promise<ActionResult> {
  requirePermission(ctx, "integrations.manage");
  const f = MetaForm.parse(input);
  const before = await existing(ctx, "META");
  const old = readSecrets<MetaSecrets>(before);
  const secrets: MetaSecrets = { accessToken: f.accessToken || old?.accessToken || "", appSecret: f.appSecret || old?.appSecret || "" };
  if (!secrets.accessToken) return { ok: false, error: "Enter the access token from Meta app → WhatsApp → API Setup." };
  if (!secrets.appSecret) return { ok: false, error: "Enter the App secret from Meta app → App settings → Basic. It is needed to check that webhooks really come from Meta." };
  let info: { display_phone_number?: string; verified_name?: string };
  try {
    info = await withTimeout(verifyMetaCredentials(f.phoneNumberId, secrets.accessToken), 10_000, "Meta");
  } catch (e) {
    return failedCheck(ctx, "META", e);
  }
  const publicConfig: MetaConfig = {
    phoneNumberId: f.phoneNumberId, wabaId: f.wabaId || undefined, displayPhone: info.display_phone_number, verifiedName: info.verified_name,
    accessTokenMasked: mask(secrets.accessToken), appSecretMasked: mask(secrets.appSecret),
  };
  const row = await scoped(ctx).integration.upsert({
    where: { workspaceId_provider: { workspaceId: ctx.workspaceId, provider: "META" } },
    create: { workspaceId: ctx.workspaceId, provider: "META", status: "CONNECTED", secrets: encryptJson(secrets), publicConfig, lastSuccessAt: new Date() },
    update: { status: "CONNECTED", secrets: encryptJson(secrets), publicConfig, lastSuccessAt: new Date(), lastError: null },
  });
  await logEvent({ workspaceId: ctx.workspaceId, provider: "META", direction: "OUT", type: "credentials.check", status: "SENT", attempts: 1, payload: { by: ctx.userId } });
  const wasConnected = before && before.status !== "NOT_CONNECTED";
  await audit.record({
    workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name,
    action: wasConnected ? "integration.updated" : "integration.connected", targetType: "Integration", targetId: row.id,
    before: wasConnected ? { provider: "META", ...(before.publicConfig as object) } : null,
    after: { provider: "META", ...publicConfig },
  });
  return { ok: true, message: wasConnected ? "WhatsApp settings saved and checked." : `WhatsApp connected (${info.display_phone_number ?? f.phoneNumberId}). Now add the webhook in the Meta app.` };
}

async function existing(ctx: Ctx, provider: Provider) {
  return scoped(ctx).integration.findUnique({ where: { workspaceId_provider: { workspaceId: ctx.workspaceId, provider } } });
}

/** Records a failed credential check in the sync history and returns a plain error. */
async function failedCheck(ctx: Ctx, provider: Provider, e: unknown): Promise<ActionResult> {
  const c = classify(provider, e);
  await logEvent({ workspaceId: ctx.workspaceId, provider, direction: "OUT", type: "credentials.check", status: "FAILED", error: c.message, attempts: 1, payload: { by: ctx.userId } });
  return { ok: false, error: c.temporary ? c.message : `${provName(provider)} did not accept these details. ${c.message}` };
}

export async function saveTwilio(ctx: Ctx, input: unknown): Promise<ActionResult> {
  requirePermission(ctx, "integrations.manage");
  const f = TwilioForm.parse(input);
  const before = await existing(ctx, "TWILIO");
  const old = readSecrets<TwilioSecrets>(before);
  const authToken = f.authToken || (old?.accountSid === f.accountSid ? old.authToken : "");
  if (!authToken) return { ok: false, error: "Enter the Auth Token (it is needed when connecting or changing the Account SID)." };

  const secrets: TwilioSecrets = { accountSid: f.accountSid, authToken };
  try {
    await withTimeout(verifyTwilioCredentials(secrets), 10_000, "Twilio");
  } catch (e) {
    return failedCheck(ctx, "TWILIO", e);
  }
  const publicConfig: TwilioConfig = {
    fromNumber: `whatsapp:${f.fromNumber}`,
    joinCode: f.joinCode,
    accountSidMasked: mask(f.accountSid),
    authTokenMasked: mask(authToken),
  };
  const row = await scoped(ctx).integration.upsert({
    where: { workspaceId_provider: { workspaceId: ctx.workspaceId, provider: "TWILIO" } },
    create: { workspaceId: ctx.workspaceId, provider: "TWILIO", status: "CONNECTED", secrets: encryptJson(secrets), publicConfig, lastSuccessAt: new Date() },
    update: { status: "CONNECTED", secrets: encryptJson(secrets), publicConfig, lastSuccessAt: new Date(), lastError: null },
  });
  await logEvent({ workspaceId: ctx.workspaceId, provider: "TWILIO", direction: "OUT", type: "credentials.check", status: "SENT", attempts: 1, payload: { by: ctx.userId } });
  const wasConnected = before && before.status !== "NOT_CONNECTED";
  await audit.record({
    workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name,
    action: wasConnected ? "integration.updated" : "integration.connected", targetType: "Integration", targetId: row.id,
    before: wasConnected ? { provider: "TWILIO", ...(before.publicConfig as object) } : null,
    after: { provider: "TWILIO", ...publicConfig },
  });
  return { ok: true, message: wasConnected ? "Twilio settings saved and checked." : "Twilio connected. Now paste the webhook URL into the Twilio sandbox settings." };
}

export async function saveStripe(ctx: Ctx, input: unknown): Promise<ActionResult> {
  requirePermission(ctx, "integrations.manage");
  const f = StripeForm.parse(input);
  const before = await existing(ctx, "STRIPE");
  const old = readSecrets<StripeSecrets>(before);
  const secrets: StripeSecrets = { secretKey: f.secretKey || old?.secretKey || "", webhookSecret: f.webhookSecret || old?.webhookSecret || "" };
  if (!secrets.secretKey) return { ok: false, error: "Enter the Stripe secret key (sk_test_…)." };
  if (!secrets.webhookSecret) return { ok: false, error: "Enter the webhook signing secret (whsec_…). Create the webhook endpoint in Stripe first, using the URL shown on this card." };
  try {
    const r = await withTimeout(verifyStripeKey(secrets.secretKey), 10_000, "Stripe");
    if (r.livemode) return { ok: false, error: "This key is for live mode. Use a test-mode key (sk_test_…)." };
  } catch (e) {
    return failedCheck(ctx, "STRIPE", e);
  }
  const publicConfig = { secretKeyMasked: mask(secrets.secretKey), webhookSecretMasked: mask(secrets.webhookSecret) };
  const row = await scoped(ctx).integration.upsert({
    where: { workspaceId_provider: { workspaceId: ctx.workspaceId, provider: "STRIPE" } },
    create: { workspaceId: ctx.workspaceId, provider: "STRIPE", status: "CONNECTED", secrets: encryptJson(secrets), publicConfig, lastSuccessAt: new Date() },
    update: { status: "CONNECTED", secrets: encryptJson(secrets), publicConfig, lastSuccessAt: new Date(), lastError: null },
  });
  await logEvent({ workspaceId: ctx.workspaceId, provider: "STRIPE", direction: "OUT", type: "credentials.check", status: "SENT", attempts: 1, payload: { by: ctx.userId } });
  const wasConnected = before && before.status !== "NOT_CONNECTED";
  await audit.record({
    workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name,
    action: wasConnected ? "integration.updated" : "integration.connected", targetType: "Integration", targetId: row.id,
    before: wasConnected ? { provider: "STRIPE", ...(before.publicConfig as object) } : null,
    after: { provider: "STRIPE", ...publicConfig },
  });
  return { ok: true, message: wasConnected ? "Stripe settings saved and checked." : "Stripe connected (test mode)." };
}

/** Makes sure a row exists so the webhook URL (which contains its id) can be shown before connecting. */
export async function ensureRow(ctx: Ctx, provider: Provider) {
  requirePermission(ctx, "integrations.manage");
  return scoped(ctx).integration.upsert({
    where: { workspaceId_provider: { workspaceId: ctx.workspaceId, provider } },
    create: { workspaceId: ctx.workspaceId, provider, status: "NOT_CONNECTED" },
    update: {},
  });
}

export async function disconnect(ctx: Ctx, provider: Provider): Promise<ActionResult> {
  requirePermission(ctx, "integrations.manage");
  const before = await existing(ctx, provider);
  if (!before || before.status === "NOT_CONNECTED") return { ok: false, error: `${provName(provider)} is not connected.` };
  // Keep the row (and its id) so the webhook URL stays the same if you reconnect. Secrets are deleted.
  await scoped(ctx).integration.update({
    where: { id: before.id },
    data: { status: "NOT_CONNECTED", secrets: null, publicConfig: {}, lastError: null },
  });
  await audit.record({
    workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "integration.disconnected",
    targetType: "Integration", targetId: before.id, before: { provider, ...(before.publicConfig as object) }, after: { provider, status: "NOT_CONNECTED" },
  });
  return { ok: true, message: `${provName(provider)} disconnected. Its saved credentials were deleted.` };
}

/** "Test connection" button: one real call to the provider, recorded in the history. */
export async function testConnection(ctx: Ctx, provider: "TWILIO" | "STRIPE" | "META"): Promise<ActionResult> {
  requirePermission(ctx, "integrations.manage");
  const row = await existing(ctx, provider);
  if (!row || row.status === "NOT_CONNECTED") return { ok: false, error: `${provName(provider)} is not connected yet.` };
  try {
    if (provider === "META") {
      const s = readSecrets<MetaSecrets>(row);
      const cfg = row.publicConfig as Partial<MetaConfig>;
      if (!s || !cfg.phoneNumberId) return { ok: false, error: "The saved credentials cannot be read. Enter them again and save." };
      await withTimeout(verifyMetaCredentials(cfg.phoneNumberId, s.accessToken), 10_000, "Meta");
    } else if (provider === "TWILIO") {
      const s = readSecrets<TwilioSecrets>(row);
      if (!s) return { ok: false, error: "The saved credentials cannot be read. Enter them again and save." };
      await withTimeout(verifyTwilioCredentials(s), 10_000, "Twilio");
    } else {
      const s = readSecrets<StripeSecrets>(row);
      if (!s) return { ok: false, error: "The saved credentials cannot be read. Enter them again and save." };
      await withTimeout(verifyStripeKey(s.secretKey), 10_000, "Stripe");
    }
  } catch (e) {
    const c = classify(provider, e);
    await scoped(ctx).integration.update({ where: { id: row.id }, data: { status: c.providerLevel ? "ERROR" : row.status, lastError: c.message } });
    return failedCheck(ctx, provider, e);
  }
  await scoped(ctx).integration.update({ where: { id: row.id }, data: { status: "CONNECTED", lastSuccessAt: new Date(), lastError: null } });
  await logEvent({ workspaceId: ctx.workspaceId, provider, direction: "OUT", type: "credentials.check", status: "SENT", attempts: 1, payload: { by: ctx.userId } });
  return { ok: true, message: `${provName(provider)} answered. The connection works.` };
}

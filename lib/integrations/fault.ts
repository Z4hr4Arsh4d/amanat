// P3 owns. Fault-test lab (PLAN §4.5): proves dedupe, signature rejection and retry/isolation on demand.
// Owner only, and only when DEMO_MODE=true (checked by every function).
import Stripe from "stripe";
import { createHmac, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/core/errors";
import type { Ctx } from "@/lib/shared/contracts";
import { sendRegistered } from "./outbox";
import "./fault-executor";
import { connected, readSecrets, webhookUrl, type MetaConfig, type StripeSecrets, type TwilioSecrets } from "./store";
import { handleStripeWebhook } from "./stripe-webhook";
import { handleMetaWebhook } from "./meta-inbound";
import { handleInbound, verifyTwilioRequest } from "./twilio-inbound";
import { demoMode } from "./google";

export function faultLabAllowed(ctx: Ctx) {
  return demoMode() && ctx.level === "OWNER";
}
function guard(ctx: Ctx) {
  if (!faultLabAllowed(ctx)) throw new HttpError(403, "The fault lab is only for the Owner, with DEMO_MODE=true.");
}

type Step = { label: string; status: number; body: string };

/** Sends one correctly signed Stripe event twice to our own webhook handler. Expect: processed once, then "duplicate". */
export async function stripeTwice(ctx: Ctx): Promise<Step[]> {
  guard(ctx);
  const conn = await connected<StripeSecrets>(ctx.workspaceId, "STRIPE");
  if (!conn) throw new HttpError(409, "Connect Stripe (or the Stripe simulator) first.");
  const p = await prisma.payment.findFirst({ where: { workspaceId: ctx.workspaceId, status: { in: ["PENDING", "ABANDONED"] } }, orderBy: { createdAt: "desc" } });
  const object = p
    ? { object: "checkout.session", id: p.stripeSessionId, payment_status: "paid", status: "complete", payment_intent: p.stripePaymentIntentId ?? `pi_fault_${randomBytes(8).toString("hex")}`, amount_total: p.amount, metadata: { workspaceId: ctx.workspaceId, paymentId: p.id } }
    : { object: "checkout.session", id: `cs_fault_${randomBytes(8).toString("hex")}`, payment_status: "paid", metadata: { workspaceId: ctx.workspaceId } };
  const payload = JSON.stringify({ id: `evt_fault_${randomBytes(10).toString("hex")}`, object: "event", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), data: { object } });
  const out: Step[] = [];
  for (const n of [1, 2]) {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: conn.secrets.webhookSecret });
    const r = await handleStripeWebhook(new Request(webhookUrl("stripe", conn.integration.id), { method: "POST", headers: { "stripe-signature": header }, body: payload }), conn.integration.id);
    out.push({ label: `Delivery ${n}${p ? ` (payment of ${p.currency} ${(p.amount / 100).toFixed(2)})` : " (no open payment: event is ignored but still deduped)"}`, status: r.status, body: await r.text() });
  }
  return out;
}

/** Sends a WhatsApp webhook with a wrong signature. Expect: 403, logged as Rejected, audited, nothing created. */
export async function forgedWhatsApp(ctx: Ctx): Promise<Step[]> {
  guard(ctx);
  const meta = await connected<{ appSecret: string }, MetaConfig>(ctx.workspaceId, "META");
  if (meta) {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: meta.config.phoneNumberId }, messages: [{ from: "923009999999", id: `wamid.FORGED${randomBytes(6).toString("hex")}`, type: "text", text: { body: "forged" } }] } }] }] });
    const sig = "sha256=" + createHmac("sha256", "not-the-real-app-secret").update(body).digest("hex");
    const r = await handleMetaWebhook(new Request(webhookUrl("whatsapp", meta.integration.id), { method: "POST", headers: { "x-hub-signature-256": sig }, body }), meta.integration.id);
    return [{ label: "Forged WhatsApp (Meta) webhook", status: r.status, body: await r.text() }];
  }
  const tw = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId: ctx.workspaceId, provider: "TWILIO" } } });
  if (tw && readSecrets<TwilioSecrets>(tw)) {
    const form = new URLSearchParams({ MessageSid: `SMFORGED${randomBytes(6).toString("hex")}`, From: "whatsapp:+923009999999", Body: "forged" });
    const req = new Request(webhookUrl("twilio", tw.id), { method: "POST", headers: { "x-twilio-signature": "Zm9yZ2Vk", "content-type": "application/x-www-form-urlencoded" }, body: form });
    const v = await verifyTwilioRequest(req, tw.id, "", "message.inbound");
    const r = v.ok ? await handleInbound(v.integration, v.params) : v.response;
    return [{ label: "Forged Twilio webhook", status: r.status, body: await r.text() }];
  }
  throw new HttpError(409, "Connect WhatsApp (Meta or Twilio, or a simulator) first.");
}

/** Queues a call to a provider that is "down". Watch it retry and then fail in the sync history. */
export async function outage(ctx: Ctx): Promise<Step[]> {
  guard(ctx);
  const r = await sendRegistered({ workspaceId: ctx.workspaceId, provider: "TELEGRAM", type: "fault.outage", payload: { by: ctx.userId, note: "fault lab" } });
  return [{ label: "Call to a provider that is down", status: r.retrying ? 202 : 500, body: r.retrying ? `Retrying automatically: ${r.error}` : (r.error ?? "") }];
}

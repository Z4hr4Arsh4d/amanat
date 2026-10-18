// P3 owns. Stripe webhook (I2.2–I2.5). Order: verify signature on the RAW body → dedupe on event.id → process → log.
// No database record changes before the signature passes (I2.3).
import type Stripe from "stripe";
import type { Integration } from "@prisma/client";
import { prisma } from "@/lib/db";
import { timeline } from "@/lib/shared/contracts";
import { claimInbound, finishEvent } from "./log";
import { rejectStripe } from "./stripe-reject";
import { markSuccess, readSecrets, type StripeSecrets } from "./store";
import { stripeClient } from "./stripe";
import { money, setStatus } from "./payments";

type Meta = { workspaceId?: string; paymentId?: string };

export async function handleStripeWebhook(req: Request, integrationId: string): Promise<Response> {
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!integration || integration.provider !== "STRIPE") return new Response("Unknown webhook", { status: 404 });
  const raw = await req.text();
  const secrets = readSecrets<StripeSecrets>(integration);
  const sig = req.headers.get("stripe-signature");
  if (integration.status === "NOT_CONNECTED" || !secrets) return rejectStripe(integration, "Stripe is not connected for this workspace", raw.length);
  if (!sig) return rejectStripe(integration, "Missing Stripe-Signature header", raw.length);

  let event: Stripe.Event;
  try {
    event = stripeClient(secrets.secretKey || "sk_test_unused").webhooks.constructEvent(raw, sig, secrets.webhookSecret);
  } catch (e) {
    return rejectStripe(integration, `Invalid signature (${(e as Error).message.split(".")[0]})`, raw.length);
  }

  // I2.4: the same event delivered twice is recorded once.
  const ev = await claimInbound({ workspaceId: integration.workspaceId, provider: "STRIPE", type: event.type, externalId: event.id, payload: summarize(event) });
  if (!ev) return Response.json({ received: true, duplicate: true });

  try {
    const note = await apply(integration, event);
    await finishEvent(ev.id, "PROCESSED", note);
    await markSuccess(integration.workspaceId, "STRIPE");
    return Response.json({ received: true });
  } catch (e) {
    console.error("[stripe webhook]", e);
    await finishEvent(ev.id, "FAILED", `Could not process: ${(e as Error).message}`);
    return new Response("Processing failed; Stripe will retry.", { status: 500 }); // reclaimed on retry (nothing lost)
  }
}

/** Keeps only what the history needs. No card data is in these objects, and nothing card-like is stored (I2.8). */
function summarize(e: Stripe.Event) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = e.data.object as any;
  return { id: e.id, type: e.type, object: o?.object, objectId: o?.id, amount: o?.amount_total ?? o?.amount, amountRefunded: o?.amount_refunded, currency: o?.currency, paymentStatus: o?.payment_status, paymentIntent: o?.payment_intent, metadata: o?.metadata };
}

async function findPayment(i: Integration, meta: Meta | null | undefined, by: { sessionId?: string; paymentIntentId?: string }) {
  const ws = i.workspaceId;
  if (meta?.workspaceId && meta.workspaceId !== ws) return null; // I5.2: another workspace's event is never applied here
  if (meta?.paymentId) {
    const p = await prisma.payment.findFirst({ where: { id: meta.paymentId, workspaceId: ws } });
    if (p) return p;
  }
  if (by.sessionId) {
    const p = await prisma.payment.findFirst({ where: { stripeSessionId: by.sessionId, workspaceId: ws } });
    if (p) return p;
  }
  if (by.paymentIntentId) return prisma.payment.findFirst({ where: { stripePaymentIntentId: by.paymentIntentId, workspaceId: ws } });
  return null;
}

const piId = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id);

/** Returns a note for the sync history, or null. */
async function apply(i: Integration, event: Stripe.Event): Promise<string | null> {
  const ws = i.workspaceId;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      const p = await findPayment(i, s.metadata as Meta, { sessionId: s.id });
      if (!p) return `No Amanat payment for session ${s.id}; ignored.`;
      if (s.payment_status !== "paid") return "Checkout finished but the payment is still processing; waiting for the result.";
      const changed = await setStatus(ws, p.id, "PAID", {
        from: ["PENDING", "ABANDONED", "FAILED", "EXPIRED"],
        data: { paidAt: new Date((event.created ?? Date.now() / 1000) * 1000), stripePaymentIntentId: piId(s.payment_intent) ?? null },
      }, `Payment of ${money(p.amount, p.currency)} received (confirmed by Stripe)`);
      return changed ? null : "Payment was already marked as paid.";
    }
    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const p = await findPayment(i, s.metadata as Meta, { sessionId: s.id });
      if (!p) return `No Amanat payment for session ${s.id}; ignored.`;
      await setStatus(ws, p.id, "FAILED", { from: ["PENDING", "ABANDONED"] }, `Payment of ${money(p.amount, p.currency)} failed`);
      return null;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const p = await findPayment(i, pi.metadata as Meta, { paymentIntentId: pi.id });
      if (!p) return `No Amanat payment for ${pi.id}; ignored.`;
      const why = pi.last_payment_error?.message ?? "the card was declined";
      // The customer can still try another card on the same link; a later success moves it to PAID.
      await setStatus(ws, p.id, "FAILED", { from: ["PENDING", "ABANDONED"], data: { stripePaymentIntentId: pi.id } }, `Payment attempt for ${money(p.amount, p.currency)} failed: ${why}`);
      return null;
    }
    case "checkout.session.expired": {
      const s = event.data.object as Stripe.Checkout.Session;
      const p = await findPayment(i, s.metadata as Meta, { sessionId: s.id });
      if (!p) return `No Amanat payment for session ${s.id}; ignored.`;
      const changed = await setStatus(ws, p.id, "EXPIRED", { from: ["PENDING", "ABANDONED", "FAILED"] }, `Payment link for ${money(p.amount, p.currency)} expired without payment`);
      return changed ? null : "Already expired or paid; nothing changed.";
    }
    case "charge.refunded": {
      const c = event.data.object as Stripe.Charge;
      const p = await findPayment(i, c.metadata as Meta, { paymentIntentId: piId(c.payment_intent) });
      if (!p) return `No Amanat payment for charge ${c.id}; ignored.`;
      const refunded = Math.min(c.amount_refunded, p.amount);
      if (refunded <= p.refundedAmount) return "Refund already recorded.";
      const to = refunded >= p.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
      // Conditional on the old refunded amount, so two refund events can't double count.
      const { count } = await prisma.payment.updateMany({
        where: { id: p.id, workspaceId: ws, refundedAmount: p.refundedAmount, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
        data: { status: to, refundedAmount: refunded },
      });
      if (count) {
        await timeline.add({ workspaceId: ws, actorId: null, type: "payment", contactId: p.contactId, opportunityId: p.opportunityId, summary: `Refund of ${money(refunded - p.refundedAmount, p.currency)} recorded (${to === "REFUNDED" ? "fully refunded" : `${money(refunded, p.currency)} of ${money(p.amount, p.currency)} refunded`})`, data: { paymentId: p.id } });
      }
      return count ? null : "Payment changed at the same time; Stripe will resend if needed.";
    }
    default:
      return `Event type ${event.type} is not used by Amanat; ignored.`;
  }
}

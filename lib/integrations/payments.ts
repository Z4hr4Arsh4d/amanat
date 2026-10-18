// P3 owns. Stripe payments (I2). collected() and projected() signatures are CONTRACTS (P2's dashboard).
// Card details are only ever entered on Stripe's hosted page; Amanat never sees or stores them (I2.8).
import { randomUUID } from "crypto";
import { z } from "zod";
import type { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit, can, leads, requirePermission, scoped, timeline, type Ctx } from "@/lib/shared/contracts";
import { HttpError, NotFound } from "@/lib/core/errors";
import { classify } from "./errors";
import { logEvent } from "./log";
import { withTimeout } from "./outbox";
import { connected, markError, markSuccess, webhookUrl, type StripeSecrets } from "./store";
import { stripeClient } from "./stripe";
import * as messaging from "./messaging";
import { isValidZone, toZonedParts, zonedToUtc } from "./time";

/** Dashboard figures are in this currency; payments in other currencies are listed but not added to it. */
export const BASE_CURRENCY = "PKR";
export const CURRENCIES = ["PKR", "USD"] as const;
const LINK_MINUTES = 31; // Stripe's minimum checkout lifetime is 30 minutes

export function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

// ───────────────────────────── CONTRACTS ─────────────────────────────

/**
 * Collected revenue (Section 7): payments confirmed by the Stripe webhook, minus confirmed refunds, in minor units
 * of BASE_CURRENCY, for payments paid in [from, to). With userId: only payments that user requested or whose
 * opportunity they own ("My performance").
 */
export async function collected(workspaceId: string, from: Date, to: Date, userId?: string): Promise<number> {
  const rows = await prisma.payment.findMany({
    where: {
      workspaceId, currency: BASE_CURRENCY, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] }, paidAt: { gte: from, lt: to },
      ...(userId ? { OR: [{ requestedById: userId }, { opportunity: { ownerId: userId } }] } : {}),
    },
    select: { amount: true, refundedAmount: true },
  });
  return rows.reduce((sum, p) => sum + p.amount - Math.min(p.refundedAmount, p.amount), 0);
}

/**
 * Projected revenue (Section 7): value of open opportunities + payment requests not yet paid, in minor units of
 * BASE_CURRENCY. A pending request on an opportunity that is still open is not counted twice.
 */
export async function projected(workspaceId: string, userId?: string): Promise<number> {
  const mine = userId ? { ownerId: userId } : {};
  const open = await prisma.opportunity.aggregate({
    where: { workspaceId, deletedAt: null, currency: BASE_CURRENCY, stage: { kind: "OPEN" }, ...mine },
    _sum: { value: true },
  });
  const pending = await prisma.payment.aggregate({
    where: {
      workspaceId, currency: BASE_CURRENCY, status: { in: ["PENDING", "ABANDONED"] },
      opportunity: { stage: { kind: { not: "OPEN" } } },
      ...(userId ? { OR: [{ requestedById: userId }, { opportunity: { ownerId: userId } }] } : {}),
    },
    _sum: { amount: true },
  });
  return Math.round(Number(open._sum.value ?? 0) * 100) + (pending._sum.amount ?? 0);
}

// ───────────────────────────── Visibility ─────────────────────────────

export const seesAllPayments = (ctx: Ctx) => can(ctx, "crm.view") && can(ctx, "dashboard.company");

/** Users without company-wide rights see payments they requested, or for their own opportunities/contacts. */
export function visiblePayments(ctx: Ctx): Prisma.PaymentWhereInput {
  if (seesAllPayments(ctx)) return {};
  return { OR: [{ requestedById: ctx.userId }, { opportunity: { ownerId: ctx.userId } }, { contact: { ownerId: ctx.userId } }] };
}

function visibleOpportunities(ctx: Ctx): Prisma.OpportunityWhereInput {
  if (seesAllPayments(ctx)) return {};
  return { OR: [{ ownerId: ctx.userId }, { contact: { ownerId: ctx.userId } }] };
}

// ───────────────────────────── Queries ─────────────────────────────

export const ListQuery = z.object({
  status: z.enum(["PENDING", "PAID", "EXPIRED", "ABANDONED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional().catch(undefined),
  month: z.enum(["current"]).optional().catch(undefined),
  contactId: z.string().max(40).optional().catch(undefined),
  opportunityId: z.string().max(40).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});
const PAGE = 25;

/** Start and end of the current month in the workspace's time zone (same rule as the dashboard, Q12). */
export function monthRange(tz = "Asia/Karachi", now = new Date()) {
  const zone = isValidZone(tz) ? tz : "UTC";
  const [y, m] = toZonedParts(now, zone).date.split("-").map(Number);
  const first = (yy: number, mm: number) => zonedToUtc(`${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-01`, "00:00", zone)!;
  return { from: first(y, m), to: m === 12 ? first(y + 1, 1) : first(y, m + 1) };
}

export async function listPayments(ctx: Ctx, raw: Record<string, string | undefined>) {
  requirePermission(ctx, "crm.view");
  const f = ListQuery.parse(raw);
  const db = scoped(ctx);
  const ws = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { timezone: true } });
  const range = monthRange(ws?.timezone);
  const where: Prisma.PaymentWhereInput = {
    AND: [
      visiblePayments(ctx),
      f.status ? { status: f.status } : {},
      // "This month" = payments received this month (same rule as the dashboard figure, Q12).
      f.month ? { paidAt: { gte: range.from, lt: range.to }, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } } : {},
      f.contactId ? { contactId: f.contactId } : {},
      f.opportunityId ? { opportunityId: f.opportunityId } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * PAGE, take: PAGE,
      include: { contact: { select: { id: true, name: true } }, opportunity: { select: { id: true, title: true } } },
    }),
    db.payment.count({ where }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.requestedById))) } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  const seesAll = seesAllPayments(ctx);
  const userFilter = seesAll ? undefined : ctx.userId;
  const [collectedMonth, projectedNow] = await Promise.all([collected(ctx.workspaceId, range.from, range.to, userFilter), projected(ctx.workspaceId, userFilter)]);
  return {
    total, page: f.page, pages: Math.max(1, Math.ceil(total / PAGE)),
    summary: { currency: BASE_CURRENCY, collectedThisMonth: collectedMonth, projected: projectedNow, mine: !seesAll },
    canRequest: can(ctx, "payments.request"),
    items: rows.map((p) => ({
      id: p.id, amount: p.amount, currency: p.currency, status: p.status, refundedAmount: p.refundedAmount,
      contact: p.contact, opportunity: p.opportunity, requestedBy: names.get(p.requestedById) ?? "Unknown",
      stripeSessionId: p.stripeSessionId, stripePaymentIntentId: p.stripePaymentIntentId, url: p.url,
      paidAt: p.paidAt, createdAt: p.createdAt,
    })),
  };
}

/** Open opportunities the user may request payment for (for the picker on /payments). */
export async function requestableOpportunities(ctx: Ctx, q?: string, id?: string) {
  requirePermission(ctx, "payments.request");
  const rows = await scoped(ctx).opportunity.findMany({
    where: { AND: [visibleOpportunities(ctx), { deletedAt: null, stage: { kind: { not: "LOST" } } }, id ? { id } : {}, q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { contact: { name: { contains: q, mode: "insensitive" } } }] } : {}] },
    orderBy: { createdAt: "desc" }, take: 30,
    include: { contact: { select: { name: true } } },
  });
  const showValue = can(ctx, "opportunity.value.view"); // F1.4: never leak the value through a default amount
  return rows.map((o) => ({ id: o.id, title: o.title, contact: o.contact.name, currency: o.currency, value: showValue ? Number(o.value) : null }));
}

// ───────────────────────────── Actions ─────────────────────────────

export const RequestSchema = z.object({
  opportunityId: z.string().min(1, "Choose an opportunity.").max(40),
  amount: z.coerce.number({ message: "Enter an amount." }).positive("The amount must be more than zero.").max(100_000_000, "That amount is too large."),
  currency: z.enum(CURRENCIES, { message: "Choose PKR or USD." }),
});

/** I2.1: create a Stripe Checkout link for an opportunity. */
export async function createRequest(ctx: Ctx, input: unknown) {
  requirePermission(ctx, "payments.request");
  const f = RequestSchema.parse(input);
  const opp = await scoped(ctx).opportunity.findFirst({
    where: { AND: [{ id: f.opportunityId, deletedAt: null }, visibleOpportunities(ctx)] },
    include: { contact: true },
  });
  if (!opp) throw NotFound();
  const conn = await connected<StripeSecrets, { simulated?: boolean }>(ctx.workspaceId, "STRIPE");
  if (!conn) throw new HttpError(409, "Stripe is not connected. An admin can connect it on the Integrations page.");

  const amount = Math.round(f.amount * 100);
  const paymentId = randomUUID();
  const metadata = { workspaceId: ctx.workspaceId, paymentId, opportunityId: opp.id, contactId: opp.contactId };
  let session: { id: string; url: string };
  try {
    if (conn.config.simulated && process.env.NODE_ENV !== "production") {
      // Dev simulator only (lib/integrations/dev/simulate-stripe.ts): no call to Stripe.
      session = { id: `cs_test_sim_${randomUUID().replace(/-/g, "")}`, url: webhookUrl("stripe", conn.integration.id, "/done?sim=1") };
    } else {
      const s = await withTimeout(
        stripeClient(conn.secrets.secretKey).checkout.sessions.create(
          {
            mode: "payment",
            line_items: [{ quantity: 1, price_data: { currency: f.currency.toLowerCase(), unit_amount: amount, product_data: { name: opp.title.slice(0, 200) } } }],
            metadata,
            payment_intent_data: { metadata },
            expires_at: Math.floor(Date.now() / 1000) + LINK_MINUTES * 60,
            success_url: webhookUrl("stripe", conn.integration.id, "/done?status=paid"),
            cancel_url: webhookUrl("stripe", conn.integration.id, "/done?status=cancelled"),
          },
          { idempotencyKey: paymentId },
        ),
        10_000,
        "Stripe",
      );
      if (!s.url) throw new Error("Stripe did not return a payment link.");
      session = { id: s.id, url: s.url };
    }
  } catch (e) {
    const c = classify("STRIPE", e);
    await markError(ctx.workspaceId, "STRIPE", c.message, c.providerLevel);
    await logEvent({ workspaceId: ctx.workspaceId, provider: "STRIPE", direction: "OUT", type: "checkout.session.create", status: "FAILED", attempts: 1, error: c.message, payload: { paymentId, opportunityId: opp.id, amount, currency: f.currency } });
    throw new HttpError(502, `Could not create the payment link. ${c.message}`);
  }

  const payment = await prisma.payment.create({
    data: {
      id: paymentId, workspaceId: ctx.workspaceId, opportunityId: opp.id, contactId: opp.contactId, requestedById: ctx.userId,
      amount, currency: f.currency, status: "PENDING", stripeSessionId: session.id, url: session.url,
    },
  });
  await logEvent({ workspaceId: ctx.workspaceId, provider: "STRIPE", direction: "OUT", type: "checkout.session.create", externalId: session.id, status: "SENT", attempts: 1, payload: { paymentId, opportunityId: opp.id, amount, currency: f.currency } });
  await markSuccess(ctx.workspaceId, "STRIPE");
  const label = money(amount, f.currency);
  await timeline.add({ workspaceId: ctx.workspaceId, actorId: ctx.userId, type: "payment", contactId: opp.contactId, opportunityId: opp.id, summary: `Payment link for ${label} created by ${ctx.name}`, data: { paymentId: payment.id } });
  await audit.record({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "payment.requested", targetType: "Payment", targetId: payment.id, after: { amount, currency: f.currency, opportunityId: opp.id, stripeSessionId: session.id } });
  await leads.markActed({ workspaceId: ctx.workspaceId, contactId: opp.contactId, userId: ctx.userId, action: "payment" });
  return { payment, message: `Payment link for ${label} created. Copy it or send it on WhatsApp.` };
}

async function loadVisiblePayment(ctx: Ctx, id: string) {
  const p = await scoped(ctx).payment.findFirst({ where: { AND: [{ id }, visiblePayments(ctx)] }, include: { contact: true, opportunity: true } });
  if (!p) throw NotFound();
  return p;
}

/** "Send on WhatsApp" button: sends the link through the normal messaging path (opt-out, outbox, history). */
export async function sendLinkOnWhatsApp(ctx: Ctx, paymentId: string) {
  requirePermission(ctx, "payments.request");
  const p = await loadVisiblePayment(ctx, paymentId);
  if (p.status !== "PENDING" && p.status !== "ABANDONED") throw new HttpError(409, "This payment link is no longer open. Create a new one.");
  const first = p.contact.name.split(" ")[0];
  const body = `Hi ${first}, here is your payment link for ${money(p.amount, p.currency)} (${p.opportunity.title}): ${p.url}\nCard details are entered securely on Stripe's page.`;
  return messaging.send({ workspaceId: ctx.workspaceId, contactId: p.contactId, body, userId: ctx.userId });
}

/** Demo "Expire" button: ends the Stripe session; the checkout.session.expired webhook confirms it. */
export async function expireRequest(ctx: Ctx, paymentId: string) {
  requirePermission(ctx, "payments.request");
  const p = await loadVisiblePayment(ctx, paymentId);
  if (p.status !== "PENDING" && p.status !== "ABANDONED") throw new HttpError(409, "Only open payment links can be expired.");
  const conn = await connected<StripeSecrets, { simulated?: boolean }>(ctx.workspaceId, "STRIPE");
  if (!conn) throw new HttpError(409, "Stripe is not connected. An admin can connect it on the Integrations page.");
  if (!conn.config.simulated) {
    try {
      await withTimeout(stripeClient(conn.secrets.secretKey).checkout.sessions.expire(p.stripeSessionId), 10_000, "Stripe");
      await logEvent({ workspaceId: ctx.workspaceId, provider: "STRIPE", direction: "OUT", type: "checkout.session.expire", externalId: null, status: "SENT", attempts: 1, payload: { paymentId: p.id, session: p.stripeSessionId } });
    } catch (e) {
      const c = classify("STRIPE", e);
      await logEvent({ workspaceId: ctx.workspaceId, provider: "STRIPE", direction: "OUT", type: "checkout.session.expire", status: "FAILED", attempts: 1, error: c.message, payload: { paymentId: p.id } });
      throw new HttpError(502, `Stripe did not expire the link. ${c.message}`);
    }
  }
  // Mark it now too, so the screen is right even if the webhook is slow; the webhook then finds nothing to change.
  await setStatus(p.workspaceId, p.id, "EXPIRED", { from: ["PENDING", "ABANDONED"] }, `Payment link for ${money(p.amount, p.currency)} expired (ended by ${ctx.name})`, ctx.userId);
  return { message: "Payment link expired. The customer can no longer pay with it." };
}

/**
 * Conditional status change: only moves from the listed statuses, so duplicate or out-of-order webhooks
 * can never move a payment backwards (e.g. PAID → EXPIRED). Returns true if it changed.
 */
export async function setStatus(
  workspaceId: string, paymentId: string, to: PaymentStatus,
  opts: { from: PaymentStatus[]; data?: Prisma.PaymentUpdateManyMutationInput }, summary: string, actorId: string | null = null,
) {
  const { count } = await prisma.payment.updateMany({ where: { id: paymentId, workspaceId, status: { in: opts.from } }, data: { status: to, ...opts.data } });
  if (count) {
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    await timeline.add({ workspaceId, actorId, type: "payment", contactId: p?.contactId, opportunityId: p?.opportunityId, summary, data: { paymentId, status: to } });
  }
  return count > 0;
}


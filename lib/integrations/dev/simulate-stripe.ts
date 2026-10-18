// P3 owns. DEV ONLY: pretend to be Stripe, so payments can be tested without a Stripe account.
// Events are signed with the workspace's webhook secret exactly like Stripe signs them, so the real
// signature check, dedupe and status rules all run.
//
//   npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts setup [workspace-slug]
//   (then create a payment link on /payments)
//   npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts pay [paymentId|latest]
//   npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts duplicate          (same event again: recorded once)
//   npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts refund [paymentId|latest] [amount]   (partial if amount given)
//   npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts fail [paymentId|latest]
//   npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts expire [paymentId|latest]
//   npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts forged             (bad signature: 400, logged, audited)
import { readFileSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { decryptJson, encryptJson } from "../secrets";

if (process.env.NODE_ENV === "production") {
  console.error("The simulator is for development only.");
  process.exit(1);
}

const prisma = new PrismaClient();
const TARGET = (process.env.SIM_TARGET ?? "http://localhost:3000").replace(/\/+$/, "");
const STATE = join(tmpdir(), "amanat-stripe-sim.json");
type State = { integrationId: string; workspaceId: string; lastPayload?: string };
const rand = (p: string) => p + randomBytes(12).toString("hex");
const load = (): State => {
  if (!existsSync(STATE)) throw new Error("Run `setup` first.");
  return JSON.parse(readFileSync(STATE, "utf8"));
};

async function post(s: State, payload: string, forge = false) {
  const i = await prisma.integration.findUniqueOrThrow({ where: { id: s.integrationId } });
  const { webhookSecret } = decryptJson<{ webhookSecret: string }>(i.secrets!);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: forge ? "whsec_wrong" : webhookSecret });
  const r = await fetch(`${TARGET}/api/webhooks/stripe/${s.integrationId}`, { method: "POST", headers: { "Stripe-Signature": header, "Content-Type": "application/json" }, body: payload });
  console.log(`→ ${r.status} ${(await r.text()).slice(0, 120)}`);
  if (!forge) writeFileSync(STATE, JSON.stringify({ ...s, lastPayload: payload }));
}

function event(type: string, object: Record<string, unknown>) {
  return JSON.stringify({ id: rand("evt_sim_"), object: "event", type, created: Math.floor(Date.now() / 1000), livemode: false, api_version: "2025-01-01", data: { object } });
}

async function payment(s: State, ref?: string) {
  const p = !ref || ref === "latest"
    ? await prisma.payment.findFirst({ where: { workspaceId: s.workspaceId }, orderBy: { createdAt: "desc" } })
    : await prisma.payment.findFirst({ where: { id: ref, workspaceId: s.workspaceId } });
  if (!p) throw new Error("No payment found. Create one on /payments first.");
  console.log(`Payment ${p.id}: ${p.currency} ${(p.amount / 100).toFixed(2)}, now ${p.status}`);
  return p;
}

/** Payments need an opportunity. If the workspace has none, add two samples so there is something to test with. */
async function ensureSampleOpportunities(workspaceId: string) {
  if (await prisma.opportunity.count({ where: { workspaceId, deletedAt: null } })) return;
  const pipeline = await prisma.pipeline.findFirst({ where: { workspaceId }, orderBy: { isDefault: "desc" }, include: { stages: { orderBy: { order: "asc" } } } });
  const stage = pipeline?.stages.find((st) => st.kind === "OPEN");
  if (!pipeline || !stage) return console.log("No pipeline with an open stage found; create an opportunity in the app first.");
  const owner = await prisma.user.findFirst({ where: { workspaceId, email: { startsWith: "hina@" } } });
  const samples = [["Ahmed Raza", "+923005550001", "5kW rooftop solar", 450000], ["Fatima Noor", "+923005550002", "Solar water heater", 85000]] as const;
  for (const [name, phone, title, value] of samples) {
    const contact = await prisma.contact.upsert({ where: { workspaceId_phone: { workspaceId, phone } }, create: { workspaceId, name, phone, ownerId: owner?.id }, update: {} });
    await prisma.opportunity.create({ data: { workspaceId, pipelineId: pipeline.id, stageId: stage.id, contactId: contact.id, ownerId: owner?.id, title, value, currency: "PKR" } });
  }
  console.log("Added 2 sample opportunities (no opportunities existed yet).");
}

async function main() {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === "setup") {
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { slug: a[0] ?? "sunrise-solar" } });
    const existing = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId: ws.id, provider: "STRIPE" } } });
    if (existing?.status === "CONNECTED" && !(existing.publicConfig as { simulated?: boolean })?.simulated) {
      console.log("This workspace already has REAL Stripe keys. Not touching them.");
    } else {
      const data = {
        status: "CONNECTED" as const,
        secrets: encryptJson({ secretKey: "sk_test_simulated", webhookSecret: "whsec_" + randomBytes(16).toString("hex") }),
        publicConfig: { simulated: true, secretKeyMasked: "sk_test_••••sim", webhookSecretMasked: "whsec_••••sim" },
      };
      await prisma.integration.upsert({
        where: { workspaceId_provider: { workspaceId: ws.id, provider: "STRIPE" } },
        create: { workspaceId: ws.id, provider: "STRIPE", ...data },
        update: data,
      });
    }
    await ensureSampleOpportunities(ws.id);
    const i = await prisma.integration.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId: ws.id, provider: "STRIPE" } } });
    writeFileSync(STATE, JSON.stringify({ integrationId: i.id, workspaceId: ws.id } satisfies State));
    console.log(`Ready: simulated Stripe for workspace ${ws.slug}. Now create a payment link on /payments.`);
    return;
  }
  const s = load();
  if (cmd === "duplicate") {
    if (!s.lastPayload) throw new Error("Send an event first (pay, refund, …).");
    return post(s, s.lastPayload);
  }
  if (cmd === "forged") return post(s, event("checkout.session.completed", { object: "checkout.session", id: "cs_forged" }), true);

  const p = await payment(s, a[0]);
  const metadata = { workspaceId: p.workspaceId, paymentId: p.id, opportunityId: p.opportunityId, contactId: p.contactId };
  const pi = p.stripePaymentIntentId ?? rand("pi_sim_");
  if (cmd === "pay") {
    await post(s, event("checkout.session.completed", { object: "checkout.session", id: p.stripeSessionId, payment_status: "paid", status: "complete", payment_intent: pi, amount_total: p.amount, currency: p.currency.toLowerCase(), metadata }));
  } else if (cmd === "fail") {
    await post(s, event("payment_intent.payment_failed", { object: "payment_intent", id: pi, amount: p.amount, metadata, last_payment_error: { code: "card_declined", message: "Your card was declined." } }));
  } else if (cmd === "expire") {
    await post(s, event("checkout.session.expired", { object: "checkout.session", id: p.stripeSessionId, payment_status: "unpaid", status: "expired", metadata }));
  } else if (cmd === "refund") {
    const refund = a[1] ? Math.round(Number(a[1]) * 100) : p.amount;
    const total = Math.min(p.amount, p.refundedAmount + refund);
    await post(s, event("charge.refunded", { object: "charge", id: rand("ch_sim_"), payment_intent: pi, amount: p.amount, amount_refunded: total, refunded: total >= p.amount, currency: p.currency.toLowerCase(), metadata }));
  } else {
    console.log("Commands: setup [slug] | pay | fail | expire | refund [id] [amount] | duplicate | forged   (id defaults to the latest payment)");
  }
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

# Amanat

> **Every lead is an amanat.** Someone is always holding it, every handover is recorded, and the record cannot be changed.

A multi-tenant CRM for 5–30 person service companies that guarantees every incoming lead has exactly one accountable owner, escalates automatically when ignored, and connects to WhatsApp (Twilio), Stripe, Google Calendar and Telegram.

**Team plan, ownership and every requirement's checklist: [PLAN.md](PLAN.md).**

## Quick start

```bash
git clone https://github.com/rameenfatima325/amanat && cd amanat
npm install                 # also runs prisma generate
cp .env.example .env        # fill in DATABASE_URL, ENCRYPTION_KEY, APP_URL
npm run db:setup            # creates tables + makes the audit log append-only
npm run seed                # sample data (2 workspaces)
npm run dev                 # web app on http://localhost:3000
npm run worker              # in a 2nd terminal: escalation timers, retries
```

Log in: workspace `sunrise-solar`, `owner@sunrise.test`, password `password123`.
Other seeded users: `admin@`, `manager@`, `hina@`, `sara@`, `ali@` (on leave). Second workspace: `capital-realty` / `owner@capital.test`.

Webhooks need a public HTTPS URL: run `ngrok http 3000` and set `APP_URL` to the ngrok URL.

## Team rules (short version)

1. **Only edit your own folders** (see PLAN.md §0). Files in `lib/shared/`, `components/slots/`, `worker/registry.ts`, `.env.example` are **append-only**.
2. **Call other people's code only through `lib/shared/contracts.ts`.** Stubs exist for everything, so you never wait.
3. **Schema is frozen.** You may only add columns to your own models. Use `npm run db:push`; no migration files.
4. **Every route:** `const ctx = await requireUser(); requirePermission(ctx, "...")`, then use `scoped(ctx)` for all DB access. Validate input with Zod.
5. **Merge at T+0:30, 1:15, 2:00, 2:45, 3:20.** `npm run typecheck` must pass before you push.

## Structure

| Folder | What | Owner |
|---|---|---|
| `lib/core` | sessions, auth, permission checks, workspace scoping | P1 |
| `lib/crm`, `lib/audit` | CRM logic, timeline, hash-chained audit | P1 |
| `lib/leads`, `lib/notify`, `lib/metrics`, `lib/filters`, `worker/` | assignment, escalation, alerts, dashboard figures | P2 |
| `lib/integrations` | Twilio, Stripe, Google, outbox, secrets | P3 |
| `lib/shared` | contracts, permissions, nav (append-only) | all |

## Setup sections (each owner fills in)

### P1 — Core & CRM
_TODO_

### P2 — Lead engine & Telegram
_TODO: how to create the bot, link a user, demo timers._

### P3 — Twilio, Stripe, Google
Credentials are entered per workspace on **/integrations** (Owner/Admin, or anyone with "Connect, change or remove integrations"). They are checked with the provider before saving, stored AES-256-GCM encrypted (`ENCRYPTION_KEY`), and only ever shown masked. Every change is in the audit history.

**Twilio WhatsApp sandbox**
1. Twilio console → Messaging → Try it out → *Send a WhatsApp message*. Each test phone sends the join phrase (e.g. `join happy-tiger`) to `+1 415 523 8886`.
2. On /integrations → WhatsApp: paste Account SID + Auth Token, keep `whatsapp:+14155238886`, add the join phrase. Save (we call Twilio to check them).
3. Copy the **Webhook URL** shown on the card into *Sandbox settings → When a message comes in* (POST). Delivery status callbacks are set automatically per message.
4. `APP_URL` must be the exact public https URL (ngrok or Railway). Signatures are checked against it, so a wrong `APP_URL` makes every webhook show as *Rejected: Invalid signature* in the sync history.

What happens: a message from an unknown number creates a contact + a WhatsApp lead (and the auto-reply "… will reply within N minutes" if *Auto-reply to customer* is on). A known number attaches to its contact; a new lead is only created if it has no open lead. `STOP` opts the customer out (composer is blocked with the reason), `START` opts back in. Duplicate deliveries are ignored; forged requests get 403 and are logged + audited.

Limits: the sandbox only reaches phones that joined it; free-form replies only within 24h of the customer's last message (error 63016 otherwise, shown in plain words).

**Testing without a Twilio account** (dev only; signs requests exactly like Twilio):
```bash
npx tsx --env-file=.env lib/integrations/dev/simulate-twilio.ts setup              # fake Twilio connection for sunrise-solar
npx tsx --env-file=.env lib/integrations/dev/simulate-twilio.ts message +923001234567 "Hi, need a quote" "Ahmed Raza"
npx tsx --env-file=.env lib/integrations/dev/simulate-twilio.ts duplicate          # same MessageSid again → ignored
npx tsx --env-file=.env lib/integrations/dev/simulate-twilio.ts forged             # bad signature → 403, logged, audited
npx tsx --env-file=.env lib/integrations/dev/simulate-twilio.ts status <messageId> failed 63016
```
Replies sent from the Inbox fail with the fake credentials; that shows the retry + failed-message handling. Connect real credentials on /integrations to replace it.

**ENCRYPTION_KEY must be the same for the whole team** when you share one database, otherwise secrets saved by one person cannot be read by another (the integration then shows as not connected).

**Outbox and retries.** Every outgoing call is an `IntegrationEvent`. Temporary failures (network, timeout, 429, 5xx) retry after 5s, 15s, 45s (4 tries) from the worker (`npm run worker`); permanent ones fail at once with a plain explanation and a Retry button. Safe with two workers running. Sync history: **/integrations/history**.

For P2 (Telegram): call `outbox.send({ workspaceId, provider: "TELEGRAM", type, payload, run })`. For worker retries, also `registerExecutor(type, { run, onResult })` in a module imported by `lib/integrations/executors.ts`; executors must load secrets from the Integration row, never from `payload` (payloads are redacted).

**Stripe (test mode)** — on /integrations → Stripe press *Show webhook URL*, add it in Stripe → Developers → Webhooks with events `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `payment_intent.payment_failed`, `charge.refunded`, then paste `sk_test_…` and `whsec_…`. Live keys are refused. Locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe/<id>`.

**Google Calendar** — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; redirect URI `{APP_URL}/api/oauth/google/callback`; add every demo Gmail as a test user (testing apps only accept listed users, and tokens may expire after 7 days).

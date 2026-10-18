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

**WhatsApp — Meta Cloud API (free, recommended).** Needs only a Facebook account; no card.
1. developers.facebook.com → *Create app* → type **Business** → add the **WhatsApp** product. Meta gives you a free **test number**.
2. WhatsApp → **API Setup**: copy the **Phone number ID** and the **temporary access token** (lasts 24h). Under "To", add each demo phone (max 5) and confirm the code WhatsApp sends.
   For a token that doesn't expire: business.facebook.com → Settings → System users → add (Admin) → *Assign assets* (your app, full control) → *Generate token* with `whatsapp_business_messaging` + `whatsapp_business_management`.
3. App settings → **Basic** → copy the **App secret**.
4. On /integrations → *WhatsApp (Meta Cloud API)*: paste Phone number ID, token, App secret → *Connect* (we check them with Meta).
5. Copy the card's **Callback URL** and **Verify token** into Meta app → WhatsApp → **Configuration** → Webhook → *Edit* → *Verify and save*. Then *Manage* webhook fields → subscribe **messages**. (`APP_URL` must be public https: ngrok or Railway.)
6. From a phone on the "To" list, send a WhatsApp message to the test number → it appears in /inbox as a lead with the auto-reply.

Signatures: `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the App secret). Statuses (sent/delivered/read/failed) arrive on the same webhook. When Meta and Twilio are both connected, Meta is used for sending.

**WhatsApp — Twilio sandbox (paid alternative).** Twilio console → Messaging → Try it out → WhatsApp; each phone sends the join phrase. Paste Account SID + Auth Token on the Twilio card and put its Webhook URL in *Sandbox settings → When a message comes in*.

What happens (either provider): a message from an unknown number creates a contact + a WhatsApp lead (and the auto-reply "… will reply within N minutes" if *Auto-reply to customer* is on). A known number attaches to its contact; a new lead is only created if it has no open lead. `STOP` opts the customer out (composer blocked with the reason), `START` opts back in. Duplicate deliveries are ignored; forged requests get 403 and are logged + audited. Free-form replies only within 24h of the customer's last message (shown in plain words otherwise).

**Testing without any WhatsApp account** (dev only; signs requests exactly like Meta / Twilio):
```bash
npx tsx --env-file=.env lib/integrations/dev/simulate-whatsapp.ts setup meta         # fake Meta connection for sunrise-solar (or: setup twilio)
npx tsx --env-file=.env lib/integrations/dev/simulate-whatsapp.ts message +923001234567 "Hi, need a quote" "Ahmed Raza"
npx tsx --env-file=.env lib/integrations/dev/simulate-whatsapp.ts duplicate          # same MessageSid again → ignored
npx tsx --env-file=.env lib/integrations/dev/simulate-whatsapp.ts forged             # bad signature → 403, logged, audited
npx tsx --env-file=.env lib/integrations/dev/simulate-whatsapp.ts status <messageId> failed 131047
```
Replies sent from the Inbox fail with the fake credentials; that shows the retry + failed-message handling. Connect real credentials on /integrations to replace it.

**ENCRYPTION_KEY must be the same for the whole team** when you share one database, otherwise secrets saved by one person cannot be read by another (the integration then shows as not connected).

**Outbox and retries.** Every outgoing call is an `IntegrationEvent`. Temporary failures (network, timeout, 429, 5xx) retry after 5s, 15s, 45s (4 tries) from the worker (`npm run worker`); permanent ones fail at once with a plain explanation and a Retry button. Safe with two workers running. Sync history: **/integrations/history**.

For P2 (Telegram): call `outbox.send({ workspaceId, provider: "TELEGRAM", type, payload, run })`. For worker retries, also `registerExecutor(type, { run, onResult })` in a module imported by `lib/integrations/executors.ts`; executors must load secrets from the Integration row, never from `payload` (payloads are redacted).

**Stripe (test mode, free)** — Stripe doesn't list Pakistan as a supported country, but test mode works for any account: sign up (choose e.g. United States), stay in **Test mode**, no verification needed.
1. On /integrations → Stripe press *Show webhook URL*; add it in Stripe → Developers → Webhooks with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`. Copy its signing secret `whsec_…`.
2. Paste `sk_test_…` (Developers → API keys) and `whsec_…` on the Stripe card. Live keys are refused.
3. /payments → *Request a payment* (or the slot on an opportunity page) → *Copy link* / *Send on WhatsApp*. Pay with card 4242 4242 4242 4242. It turns **Paid** live when the webhook arrives; refund in the Stripe dashboard → **Refunded** / **Partly refunded**.
4. Locally without a public URL: `stripe listen --forward-to localhost:3000/api/webhooks/stripe/<integrationId>` and use the `whsec_` it prints.

Rules: the signature is checked on the raw body before anything changes; each event id is processed once; statuses never move backwards (a late "expired" can't undo "paid"); unpaid links older than `ABANDON_SECONDS` become **Abandoned** (worker job) and still turn Paid if paid later. *Collected* = paid minus refunds (PKR); *Projected* = open opportunity values + unpaid links on non-open opportunities. Amanat never sees card details.

**Testing payments without a Stripe account** (dev only):
```bash
npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts setup      # fake Stripe + 2 sample opportunities if none exist
# create a link on /payments, then:
npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts pay        # latest payment → Paid
npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts duplicate  # same event again → recorded once
npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts refund latest 10000   # partial refund (omit amount for full)
npx tsx --env-file=.env lib/integrations/dev/simulate-stripe.ts fail | expire | forged
```

**Google Calendar** — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; redirect URI `{APP_URL}/api/oauth/google/callback`; add every demo Gmail as a test user (testing apps only accept listed users, and tokens may expire after 7 days).

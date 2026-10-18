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

**What's here:** sign-up/login, users & roles, workspace isolation, contacts, companies, opportunities, custom fields,
pipelines (board + list), field masking, CSV export, contact timeline, and the tamper-evident audit log.

| Area | Where | Notes |
|---|---|---|
| Auth (F1.1, Q1) | `/signup`, `/login`, `lib/core/auth.ts`, `lib/core/session.ts` | bcrypt (cost 12); random 32-byte session token in an httpOnly cookie, only its sha256 stored; 7-day sliding expiry; 5 failed logins per email (20 per IP) in 15 min → locked; "Log out of all devices" in the sidebar |
| Users & levels (F1.2, F1.3) | `/settings/users` | Invite links (shown once, hashed, 7 days). Admins can't touch the Owner, nobody changes their own level, always exactly one Owner. Deactivating logs the person out everywhere |
| Roles (F1.3) | `/settings/roles` | Permission checkboxes per role. A role in use can't be deleted (move people first) |
| Permissions + isolation (F1.5, F1.6, Q2) | `requireUser()`, `requirePermission()`, `scoped(ctx)` | Every action checks on the server. Another workspace's id → **404** |
| Masking (F1.4) | `lib/crm/serialize.ts` | Opportunity values show `•••••` without `opportunity.value.view` — on pages, board, API and CSV |
| CRM (F2.1) | `/contacts`, `/companies`, `/opportunities` | Search by name/phone/email, 25 per page. Phones saved as E.164 (`0300 1234567` → `+923001234567`). Soft deletes |
| Custom fields (F2.2, F2.3) | `/settings/fields` | Text, number, date, dropdown, checkbox. Show up on every form immediately. Opportunity fields can be shared or per pipeline |
| Pipelines (F2.4, F2.5) | `/settings/pipelines`, `/opportunities?view=board` | Drag cards or use "Move to ▼" (keyboard/phone). Required fields per stage → *"Fill Budget before moving to Proposal."* Deleting a stage with deals asks where to move them (one transaction) |
| Conflicts (Q4) | all edits | Saves carry a version; if someone saved first → *"Someone else changed this record. Reload to see their change."* |
| Timeline (F2.7, F2.8) | contact & opportunity pages | Notes, field edits (from → to), stage moves, plus P2/P3 events. Who and when on every entry |
| Audit (F4.1–F4.3) | `/audit`, `lib/audit` | Append-only, sha256 hash chain, DB trigger blocks UPDATE/DELETE. **Verify history** finds the first altered or missing entry |

**Seed data** (`npm run seed`): workspace `sunrise-solar` (300 contacts, 40 companies, 80 opportunities, pipelines *Sales* +
*Solar Installs*, fields City / Budget / System size / Panel brand) and a small `capital-realty` workspace to prove isolation.
All passwords `password123`: `owner@`, `admin@`, `manager@` (Manager role), `hina@` and `sara@` (Sales role), `ali@` (on leave).
⚠ The seed **wipes and rebuilds** those two workspaces in the shared database — agree with the team before running it.

**Security check** (demo step 1): with the app running and seeded,

```bash
node scripts/security-check.mjs                       # or ./scripts/security-check.sh
node scripts/security-check.mjs https://<railway-url> --bruteforce
```

It logs in as three users and shows: no cookie → **401**, Sales user deleting a contact → **403**, another workspace's
contact/opportunity → **404**, values masked for Sales, cross-site POST → **403**, and (with `--bruteforce`) the **429** lockout.

**Tamper demo** (demo step 8): in Railway → Postgres → Database → Query run

```sql
ALTER TABLE "AuditLog" DISABLE TRIGGER audit_no_update;
UPDATE "AuditLog" SET "actorLabel" = 'Hacker' WHERE seq = 2;
ALTER TABLE "AuditLog" ENABLE TRIGGER audit_no_update;
```

then press **Verify history** on `/audit` → red: *"Entry #2 has been altered."*

**JSON API** (session cookie required): `POST /api/auth/login` · `GET /api/contacts?q=&page=` · `GET|DELETE /api/contacts/:id` ·
`GET /api/opportunities?page=` · `GET /api/opportunities/:id` · `GET /api/export/contacts` · `GET /api/export/opportunities`.

**For P2/P3:** call `audit.record()` and `timeline.add()` from `@/lib/audit` and `@/lib/crm/timeline` (safe in the worker and
webhooks — no session needed). Server actions return `{ ok, data | error }` via `act()` in `lib/core/action.ts`; on the client use
`useAction()` from `components/ui/useAction.ts` for spinner + toasts. Shared UI pieces live in `components/ui/`.

### P2 — Lead engine & Telegram
**Pages:** `/leads` (my leads, countdown, Acknowledge, team panel, New lead), `/recovery`, `/dashboard`, `/lists`, `/settings/assignment`, public form `/f/<workspace-slug>`.

**1. Create the Telegram bot (once)**
1. In Telegram open **@BotFather** and send `/newbot`. Name it `Amanat Alerts`, pick a username ending in `bot`.
2. Copy the token it gives you (looks like `123456:ABC...`).
3. Telegram only talks to public **https** addresses. Run `ngrok http 3000` and set `APP_URL` in `.env` to the https address, then restart `npm run dev`.
4. Log in as an Owner/Admin, open **Integrations**, find the **Telegram** card, paste the token and press **Connect**. Amanat checks the token, sets the webhook with a random secret, and stores both encrypted. Only a masked token is ever shown.

**2. Link a person to the bot**
- Each employee presses **Connect Telegram** (Telegram card or profile), which opens the bot with a one-time link. Press **Start** in Telegram. The bot replies "Connected to Amanat ✅".
- **Send test alert** checks it works. Alerts have an **✅ Acknowledge** button: tapping it acknowledges the lead and the message changes to "Acknowledged by you at HH:MM". If the lead already moved on, it says "This lead has moved to <name>".
- Failed alerts are retried 3 times (after 5s, 15s, 45s), then shown as failed with a plain reason in the card.

**3. Run the worker** (a second terminal): `npm run worker`. It checks every 2 seconds for leads past their deadline and escalates them, and retries Telegram alerts. Nothing lives in memory, so it is safe to stop and restart.

**4. Demo timers.** Everything is in seconds on **Settings → Assignment**: acknowledge window, idle period, and the seconds for each escalation level. For a quick demo use an acknowledge window of 30 and levels of 30 / 30 / 60.

**5. Show the proofs**
- *Restart safety:* assign a lead, press Ctrl+C on the worker, wait past the countdown, start it again: the lead escalates exactly once.
- *Two workers at once:* start `npm run worker` in two terminals. Each overdue lead still escalates once (conditional update on `version`).
- *Automated check:* `npx tsx --conditions=react-server --env-file=.env worker/test-escalation.ts` creates its own throwaway workspace, escalates one overdue lead from two workers at the same instant and asserts exactly one escalation.

**Rules worth knowing.** Routing reason: every assignment records who was skipped and why. Absence: unacknowledged leads move at once; acknowledged leads stay but are flagged "Owner away" and appear in the recovery queue. Filters: the contacts and opportunities pages read `?f=` with `filters.parseFilterParam` + `filters.buildWhere` (see `lib/shared/contracts.ts`).

### P3 — Twilio, Stripe, Google
Credentials are entered per workspace on **/integrations** (Owner/Admin, or anyone with "Connect, change or remove integrations"). They are checked with the provider before saving, stored AES-256-GCM encrypted (`ENCRYPTION_KEY`), and only ever shown masked. Every change is in the audit history.

**Website chat (built in, no account needed — works out of the box).** Customers open `{APP_URL}/api/webhooks/webchat/<workspace-slug>` (e.g. `/api/webhooks/webchat/sunrise-solar`; the link and an on/off switch are on /integrations → *Website chat*), enter a name, phone and message, and chat live. It uses the same pipeline as WhatsApp: contact matching by phone, a lead with an owner (source shown as *Web form*), the auto-reply, escalation handoff messages ("Hina is unavailable; Omar is now handling your request"), opt-out (STOP/START), timeline and sync history. Staff answer from /inbox (channel badge: Website chat / WhatsApp); replies show in the customer's tab within seconds and as "Seen by the customer". Safety: signed per-session tokens (a customer sees only their own chat), validation, rate limits, a honeypot field, no HTML rendering. Needs `npm run db:push` once (adds `WEBCHAT` to the Provider enum).

**WhatsApp — Meta Cloud API (optional, free).** Needs only a Facebook account; no card.
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

**Google Calendar (free)**
1. console.cloud.google.com → new project → enable **Google Calendar API** → OAuth consent screen: *External*, status *Testing*, add every demo Gmail as a **test user**.
2. Credentials → *OAuth client ID* → *Web application* → redirect URI `{APP_URL}/api/oauth/google/callback` (add both `http://localhost:3000/...` and your public URL).
3. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, restart. Each employee opens **My calendar** → *Connect Google Calendar*.
- Tokens are stored encrypted on the server only; access tokens refresh automatically; a revoked/expired grant shows **Needs reconnect** (and the employee is not bookable until they reconnect). Disconnect revokes access at Google.
- Booking (opportunity page → *Book an appointment*): employees without a working calendar are listed as **Not bookable** with the reason; times are typed and shown in the **employee's time zone** and stored in UTC + the zone; Google free/busy (and existing Amanat appointments) give a live **conflict warning** and Book stays disabled (managers with *Reassign leads* may *Book anyway*). Reschedule / Cancel update the Google event and the timeline.
- `calendar.isBusyNow(userId)` (for P2's routing) returns `{ until }` while the employee is in a meeting, cached 60s, `false` if free / not connected / on error. Safe to import from the worker.
- **My calendar → Check now** tests the Google connection step by step (sign-in, busy times, events) and explains any problem in plain words; **Add a test event** puts a clearly named event 1 hour ahead so you can see it in Google Calendar. Booked appointments show an *Open in Google Calendar* link.
- **Demo calendar** (no Google needed, `DEMO_MODE=true`): on My calendar press *Use a demo calendar*. Everything works the same, but busy times come from the employee's Amanat appointments.

**Fault lab** (Owner only, `DEMO_MODE=true`): /integrations → *Fault lab*. Sends the same signed Stripe event twice (recorded once), a forged WhatsApp webhook (403, logged, audited), and a call to a provider that is down (retries 5s/15s/45s with the worker running, then Failed; nothing else breaks).

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

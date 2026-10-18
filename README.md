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
- *Automated check:* `npx tsx --env-file=.env worker/test-escalation.ts` creates its own throwaway workspace, escalates one overdue lead from two workers at the same instant and asserts exactly one escalation.

**Rules worth knowing.** Routing reason: every assignment records who was skipped and why. Absence: unacknowledged leads move at once; acknowledged leads stay but are flagged "Owner away" and appear in the recovery queue. Filters: the contacts and opportunities pages read `?f=` with `filters.parseFilterParam` + `filters.buildWhere` (see `lib/shared/contracts.ts`).

### P3 — Twilio, Stripe, Google
_TODO: sandbox join phrase, Stripe webhook events to enable, Google test users, what each integration can and can't do._

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
_TODO: sandbox join phrase, Stripe webhook events to enable, Google test users, what each integration can and can't do._

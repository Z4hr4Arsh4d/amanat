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
_TODO: how to create the bot, link a user, demo timers._

### P3 — Twilio, Stripe, Google
_TODO: sandbox join phrase, Stripe webhook events to enable, Google test users, what each integration can and can't do._

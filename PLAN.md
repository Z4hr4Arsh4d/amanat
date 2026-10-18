# Amanat: 4-Hour Build Plan

> *Every lead is an amanat.* One person holds it at any moment, every handover is recorded, and the record cannot be changed.

**Team:** P1 = Records (**Zahra**) · P2 = Lead Engine (**Hadia**) · P3 = Integrations (**Imtiaz**)
**Goal:** every F, I and Q requirement done and demonstrable. Nothing left out.
**Clock:** T+0:00 is when you start. Merge checkpoints at **T+0:30, T+1:15, T+2:00, T+2:45, T+3:20**. Code freeze at **T+3:30**.

---

## 0. Ground rules (read first, 2 minutes)

1. **Stack (no debate):** Next.js 15 (App Router) + TypeScript + Prisma + PostgreSQL (Neon or Railway) + Tailwind + shadcn/ui + Zod + SWR + sonner (toasts). Worker: `tsx worker/index.ts`. Deploy: Railway (one web service + one worker service + Postgres).
2. **Folder ownership. Never edit another person's folder.**

   | Owner | Folders |
   |---|---|
   | P1 | `app/(auth)`, `app/(app)/layout.tsx`, `app/(app)/contacts`, `app/(app)/companies`, `app/(app)/opportunities`, `app/(app)/settings/{users,roles,fields,pipelines}`, `app/(app)/audit`, `lib/core`, `lib/crm`, `lib/audit`, `components/ui`, `prisma/` |
   | P2 | `app/(app)/leads`, `app/(app)/recovery`, `app/(app)/dashboard`, `app/(app)/settings/assignment`, `app/(app)/lists`, `app/f/[slug]` (public form), `app/api/live`, `app/api/webhooks/telegram`, `lib/leads`, `lib/metrics`, `lib/notify`, `lib/filters`, `worker/` |
   | P3 | `app/(app)/inbox`, `app/(app)/payments`, `app/(app)/integrations`, `app/(app)/settings/calendar`, `app/api/webhooks/{twilio,stripe}`, `app/api/oauth/google`, `lib/integrations/**` |

3. **Shared files are append-only:** `lib/shared/permissions.ts`, `lib/shared/events.ts`, `lib/shared/contracts.ts`, `components/slots/*`, `.env.example`, `worker/registry.ts`, `README.md` (each person has their own section).
4. **Schema:** P1 writes the **entire** `prisma/schema.prisma` in the first 30 minutes (Section 1). After that, each person may only **add columns to their own models**. Use `prisma db push`, with **no migration files**.
5. **Git:** branches `p1/*`, `p2/*`, `p3/*`. At each checkpoint: `git pull origin main`, merge, push, and confirm `npm run build` passes. If something breaks, the person who merged last fixes it immediately.
6. **Every server route and action** begins with `const ctx = await requireUser()` then `requirePermission(ctx, "...")`, and **all** DB access goes through `scoped(ctx)`. No exceptions (F1.5, F1.6, Q2).
7. **Every input** is parsed with Zod on the server (Q3). Never use `dangerouslySetInnerHTML`.
8. **Every timer value is in seconds and configurable** so judges can watch it happen live.

---

## 1. First 30 minutes: who does what

### P1: skeleton (push to `main` by T+0:30)
- [ ] `npx create-next-app amanat --ts --tailwind --app`, add shadcn/ui, Prisma, Zod, SWR, sonner, argon2, `@node-rs/argon2` or `bcryptjs`.
- [ ] Write the full schema below, run `prisma db push`.
- [ ] `lib/core/session.ts`: `requireUser()`, `requirePermission()`, `scoped(ctx)` (minimal working versions).
- [ ] Create every shared file from Section 5 with **stub bodies**.
- [ ] Create empty slot components in `components/slots/` (Section 5).
- [ ] `.env.example`, `README.md` skeleton, app layout with sidebar nav (nav items in `lib/shared/nav.ts`, append-only).

**Full schema (P1 types this in; field list is the contract):**
```
Workspace(id, name, slug unique, createdAt)
User(id, workspaceId, email, name, passwordHash, level OWNER|ADMIN|USER, roleId?, status AVAILABLE|BUSY|ON_LEAVE|OFFLINE,
     timezone default "Asia/Karachi", telegramChatId?, telegramLinkToken?, isActive, createdAt) @@unique(workspaceId,email)
Role(id, workspaceId, name, permissions String[])
Session(id, userId, tokenHash unique, expiresAt, createdAt)
LoginAttempt(id, email, ip, success, createdAt)
Invite(id, workspaceId, email, level, roleId?, tokenHash, expiresAt, acceptedAt?)
Company(id, workspaceId, name, customFields Json, version, deletedAt?)
Contact(id, workspaceId, companyId?, name, email?, phone? (E.164), optedOut bool, optedOutAt?, ownerId?, tags String[],
        customFields Json, version, deletedAt?, createdAt) @@unique(workspaceId, phone)
Pipeline(id, workspaceId, name, isDefault)
Stage(id, pipelineId, name, order, kind OPEN|WON|LOST, requiredFieldIds String[])
FieldDef(id, workspaceId, entity CONTACT|COMPANY|OPPORTUNITY, pipelineId?, key, label, type TEXT|NUMBER|DATE|DROPDOWN|CHECKBOX,
         options String[], order, deletedAt?)
Opportunity(id, workspaceId, pipelineId, stageId, contactId, ownerId?, title, value Decimal, currency, customFields Json,
            version, createdAt, closedAt?, deletedAt?)
SavedList(id, workspaceId, userId, name, entity, filters Json, shared bool)
Activity(id, workspaceId, contactId?, opportunityId?, leadId?, actorId? (null = system), type, summary, data Json, createdAt)
AuditLog(id, workspaceId, seq Int, actorId?, actorLabel, action, targetType, targetId, before Json?, after Json?,
         prevHash, hash, createdAt) @@unique(workspaceId, seq)
Lead(id, workspaceId, contactId, source WEB_FORM|WHATSAPP|MANUAL, status NEW|ASSIGNED|ACKNOWLEDGED|UNASSIGNED|CLOSED,
     ownerId?, firstAssignedAt?, assignedAt?, deadlineAt?, acknowledgedAt?, firstAcknowledgedAt?, escalationLevel Int,
     escalationCount Int, lastActionAt?, ownerOnLeaveFlag bool, version Int, createdAt)
LeadAssignment(id, leadId, fromUserId?, toUserId?, kind AUTO|ESCALATION|MANUAL|ABSENCE, level Int, reason Text, actorId?, createdAt)
AssignmentConfig(workspaceId unique, maxOpenLeads Int, ackWindowSeconds Int, idleSeconds Int,
                 levels Json  // [{type:"NEXT_ELIGIBLE"|"BACKUP"|"MANAGER", seconds}]
                 backupUserId?, managerUserId?, rrCursor Int, useCalendarBusy bool, autoReplyCustomer bool)
Notification(id, workspaceId, userId, leadId?, channel INAPP|TELEGRAM, title, body, status PENDING|SENT|FAILED,
             attempts Int, lastError?, nextAttemptAt?, readAt?, createdAt)
DashboardPref(userId unique, hiddenTiles String[])
Integration(id, workspaceId, provider TWILIO|STRIPE|TELEGRAM|GOOGLE, status NOT_CONNECTED|CONNECTED|ERROR,
            secrets String (AES-GCM encrypted JSON), publicConfig Json, lastSuccessAt?, lastError?, updatedAt) @@unique(workspaceId, provider)
CalendarConnection(id, userId unique, googleEmail, refreshTokenEnc, accessTokenEnc?, expiresAt?, status CONNECTED|NEEDS_RECONNECT)
IntegrationEvent(id, workspaceId, provider, direction IN|OUT, type, externalId?, status RECEIVED|PROCESSED|REJECTED|FAILED|RETRYING|SENT,
                 attempts Int, nextAttemptAt?, error?, payload Json (redacted), createdAt) @@unique(provider, externalId)
Conversation(id, workspaceId, contactId, channel WHATSAPP, assigneeId?, opportunityId?, lastMessageAt) @@unique(contactId, channel)
Message(id, conversationId, direction IN|OUT, body, providerSid? unique, status QUEUED|SENT|DELIVERED|READ|FAILED|RECEIVED,
        errorCode?, errorReason?, sentById?, createdAt)
Payment(id, workspaceId, opportunityId, contactId, requestedById, amount Int (minor units), currency, status
        PENDING|PAID|EXPIRED|ABANDONED|FAILED|REFUNDED|PARTIALLY_REFUNDED, refundedAmount Int,
        stripeSessionId unique, stripePaymentIntentId?, url, paidAt?, createdAt)
Appointment(id, workspaceId, userId, contactId, opportunityId?, googleEventId, title, startUtc, endUtc, timezone,
            status BOOKED|RESCHEDULED|CANCELLED, createdById, createdAt)
```

### P2 (meanwhile)
- [ ] Create the Telegram bot with @BotFather and copy the token. Turn on inline mode (not needed) and set the bot name to "Amanat Alerts".
- [ ] Create the Railway project with Postgres, and share `DATABASE_URL` with the team.
- [ ] Draft `lib/leads/engine.ts` logic on paper (Section 3).

### P3 (meanwhile)
- [ ] Twilio: open the WhatsApp Sandbox, join from 2 phones, copy the Account SID and Auth Token.
- [ ] Stripe: switch to test mode, copy the secret key, install the Stripe CLI, `stripe login`.
- [ ] Google Cloud: create a project, enable the Calendar API, set the OAuth consent screen to *Testing*, add all 3 team Gmail accounts as test users, create a Web OAuth client with redirect `{APP_URL}/api/oauth/google/callback` (add both localhost and the Railway URL).
- [ ] Start `ngrok http 3000` and share the HTTPS URL. **Deploy to Railway by T+1:15** so webhooks have a stable URL.

---

## 2. P1: Records (Core, CRM, Audit)

**Owns:** F1.1–F1.6, F2.1–F2.5, F2.7, F2.8, F4.1–F4.3, Q1, Q2, Q3, Q4, Q6, Q7, Q8, Q10, Q13 (base).

### 2.1 Auth: F1.1, Q1 (target: done by T+0:50)
- [ ] `/signup`: creates a Workspace (slug from name) and a User with level OWNER, all in one transaction. Seed the default pipeline (stages: New, Qualified, Proposal, Won[WON], Lost[LOST]), a default `AssignmentConfig` (maxOpen 5, ack 60s, idle 300s, levels `[{NEXT_ELIGIBLE,60},{BACKUP,60},{MANAGER,120}]`), and a "Manager" role.
- [ ] Hash passwords with argon2id (or bcrypt cost 12). **Never** log passwords.
- [ ] Session: random 32-byte token in an `httpOnly; Secure; SameSite=Lax` cookie, sha256 of the token stored in `Session`, 7-day expiry, sliding refresh. `/logout` deletes the row. Refreshing the page keeps the user logged in.
- [ ] "Log out all sessions" button on the profile page.
- [ ] Brute-force protection: more than 5 failed `LoginAttempt` rows for the same email or IP in 15 min → 429 "Too many attempts, try again in N minutes."
- [ ] CSRF: `middleware.ts` rejects any non-GET `/api/*` request whose `Origin` header ≠ `APP_URL` (webhook routes excluded, since they use signatures). Server Actions already check origin.

### 2.2 Users, levels, permissions: F1.2, F1.3, F1.5
- [ ] `lib/shared/permissions.ts` (append-only):
  `crm.view, crm.create, crm.edit, crm.delete, crm.export, opportunity.value.view, pipeline.configure, assignment.manage, leads.reassign, integrations.manage, audit.view, users.manage, dashboard.company, payments.request, appointments.book`
- [ ] Owner = all permissions implicitly. Admin = all except changing the Owner. User = the permissions on their Role.
- [ ] `/settings/users`: invite by email (create an Invite and **show the invite link** on screen; no email needed), set level, set role, set status, deactivate.
- [ ] Server rules: an Admin cannot edit, demote or deactivate the Owner (403). Nobody can change their own level. There is always exactly one Owner.
- [ ] `/settings/roles`: a checkbox grid (roles × permissions). Create, rename and delete roles. A role in use cannot be deleted until its users are moved (Q4).
- [ ] Every change → `audit.record("role.permissions_changed", before, after)`.

### 2.3 Isolation and enforcement: F1.5, F1.6, Q2
- [ ] `scoped(ctx)` returns Prisma helpers that **always** add `where: { workspaceId: ctx.workspaceId }`. For child tables (Stage, Message) check the parent's workspace.
- [ ] A record from another workspace returns **404** (not 403), so attackers can't tell that an ID exists.
- [ ] Use `cuid()` IDs everywhere.
- [ ] Write `scripts/security-check.sh`: curl calls showing (a) a User without `crm.delete` gets 403 on DELETE, (b) a workspace-B ID used from workspace A gets 404, (c) no cookie gets 401. **Use this in the demo.**

### 2.4 Field masking: F1.4
- [ ] `lib/crm/serialize.ts`: `serializeOpportunity(o, ctx)` sets `value: null, valueMasked: true` when the user lacks `opportunity.value.view`. **Every** list, detail and export response goes through it. The UI shows "•••••".
- [ ] CSV export (`/api/export/{contacts,opportunities}`) needs `crm.export`, uses the same serializer, and records an audit entry `export`.

### 2.5 CRM entities: F2.1
- [ ] Companies: list, create, edit, delete (soft delete; if contacts are attached → ask to unlink first or move them).
- [ ] Contacts: list (paginated, 25 per page, search by name, phone or email; Q9), create, edit, delete. A contact belongs to one company. Phones are normalized to E.164 (needed by P3 for matching).
- [ ] Opportunities: belong to a contact, a pipeline and a stage, with an owner, value and currency.
- [ ] Seed script `prisma/seed.ts` (P1 owns): 2 workspaces (to prove isolation), 6 users with mixed levels and statuses, 300 contacts, 40 companies, 80 opportunities across stages, 2 pipelines. P2 and P3 add their own seed functions in `prisma/seed/leads.ts` and `prisma/seed/integrations.ts`.

### 2.6 Custom fields: F2.2, F2.3
- [ ] `/settings/fields`: add a field (label, type TEXT, NUMBER, DATE, DROPDOWN or CHECKBOX, options for dropdown, entity, optional pipeline). Reorder and delete (soft delete; existing values are hidden, not lost).
- [ ] `<DynamicFields entity pipelineId values onChange/>` renders the right input for each type. It is used on every create/edit form and detail page, so a new field appears **immediately**.
- [ ] Server validation: build a Zod schema from the FieldDefs at request time (number must be numeric, dropdown value must be one of the options, etc.).
- [ ] F2.3: opportunity fields are filtered by `pipelineId`. Create a second pipeline, "Solar Installs", with different fields. Contact fields are shared by both.

### 2.7 Pipeline: F2.4, F2.5
- [ ] `/settings/pipelines`: add, rename, reorder (up/down buttons; keyboard friendly, Q8) and delete stages, and set the kind (OPEN, WON or LOST) and required fields per stage.
- [ ] Deleting a stage that holds opportunities opens a modal: "This stage has 7 opportunities. Move them to: [stage ▼]". Move and delete happen in **one transaction**, plus an audit entry.
- [ ] Board view `/opportunities?view=board` (columns = stages, drag with dnd-kit **and** a "Move to ▼" dropdown on each card for keyboard and mobile use), plus a list view.
- [ ] Moving a stage on the server: check the target stage's `requiredFieldIds` → if any are empty, return 422 `{ missing: ["Roof size", "Budget"] }`. The UI shows: "Fill Roof size and Budget before moving to Proposal." Then add a timeline entry and call `leads.markActed`.
- [ ] Concurrency (Q4): every update uses `where: { id, version }` and `version: { increment: 1 }`. If 0 rows were updated → 409, and the toast says "Someone else changed this record. Reload to see their change."

### 2.8 Timeline and contact page: F2.7, F2.8
- [ ] `lib/crm/timeline.ts` → `timeline.add()` (contract). Types: `note, stage_change, assignment, field_edit, message, payment, appointment, lead_created, escalation, acknowledged`.
- [ ] Field edits: diff old vs new custom fields and write one `field_edit` entry with `{field, from, to}`.
- [ ] Notes: add a note on a contact or opportunity → timeline entry + `leads.markActed(contactId, userId, "note")`.
- [ ] Contact page `/contacts/[id]`: header (name, company, phone, email, opt-out badge, **assigned employee**), then tabs or sections:
  - Opportunities (yours)
  - `<ConversationSlot contactId/>` (P3)
  - `<PaymentsSlot contactId/>` (P3)
  - `<AppointmentsSlot contactId/>` (P3)
  - `<LeadSlot contactId/>` (P2)
  - Timeline (yours), newest first, showing **who and when**
- [ ] Opportunity page: same layout + `<PaymentRequestSlot opportunityId/>` and `<BookAppointmentSlot opportunityId contactId/>` (P3).

### 2.9 Audit with hash chain: F4.1, F4.2, F4.3 (the "proof" feature)
- [ ] `audit.record({ ctx|system, action, targetType, targetId, before, after })` inside a transaction:
  `SELECT pg_advisory_xact_lock(hashtext(workspaceId))` → read the last row → `seq = last.seq + 1`, `prevHash = last.hash ?? "GENESIS"`, `hash = sha256(prevHash + canonicalJSON({seq, actor, action, target, before, after, createdAt}))`.
- [ ] Actions that must be recorded: `lead.assigned, lead.acknowledged, lead.escalated, lead.reassigned, user.level_changed, role.permissions_changed, field.created/updated/deleted, stage.created/renamed/reordered/deleted, pipeline.*, integration.connected/disconnected/updated, *.deleted, export`.
- [ ] `prisma/sql/audit_guard.sql` (run in `npm run db:setup` after `db push`): a trigger that `RAISE EXCEPTION` on UPDATE or DELETE of `AuditLog`. There is **no** edit or delete endpoint or button.
- [ ] `/audit`: needs `audit.view` (otherwise 403 page). Filters: event type, user, date range. Paginated. Expanding a row shows before/after as a diff.
- [ ] **"Verify history" button**: recompute every hash in order. Green "All 1,284 entries intact", or red "Entry #482 has been altered (expected hash ab12…, found 9f3c…)".
- [ ] Demo: `psql` as superuser → `ALTER TABLE ... DISABLE TRIGGER`, change a row, enable it again → click Verify → red.

### 2.10 Layout, responsiveness, accessibility: Q7, Q8, Q10
- [ ] Sidebar collapses to a hamburger menu under 768px. Tables become cards on mobile. Check at 375px width that nothing scrolls sideways.
- [ ] Every input has a `<Label htmlFor>`, focus rings are visible, and status chips have **text + icon**, not color alone. Use shadcn defaults (they are accessible).
- [ ] A shared `useAction()` hook: shows a button spinner, a success toast, and an error toast with the server message plus what to do.

---

## 3. P2: Lead Engine (Leads, Escalation, Dashboard, Telegram)

**Owns:** F3.1–F3.9, F5.1–F5.5, F2.6, I4.1–I4.4, Q5 (timers), Q9 (filters), Q11, Q12.

### 3.1 Intake: F3.1 (by T+1:00)
- [ ] `lib/leads/intake.ts` → `leads.intake({ workspaceId, contactId, source, actorId? })`: create the Lead, a `lead_created` timeline entry and an audit entry, then call `assign(lead)` immediately.
- [ ] Public web form `/f/[slug]`: name, phone, email, message. Zod validation, a hidden honeypot field, rate limit 5 per minute per IP. Finds or creates the contact by phone or email → `intake(source: WEB_FORM)`. Thank-you page.
- [ ] Manual entry: "New lead" button on `/leads` (pick or create a contact) → `intake(source: MANUAL)`.
- [ ] WhatsApp intake: P3 calls your `leads.intake(source: WHATSAPP)`.
- [ ] Source is shown as a badge everywhere.

### 3.2 Availability: F3.2
- [ ] A status selector in the top bar (Available, Busy, On leave, Offline) for yourself. Admins can set anyone's status from `/settings/users` or the `/leads` team panel.
- [ ] `setStatus(userId, status)` in `lib/leads/availability.ts`: audit entry + if the new status is ON_LEAVE or OFFLINE → call `handleAbsence(userId)` (3.6).

### 3.3 Assignment: F3.3 and the "routing reason"
- [ ] `/settings/assignment` (needs `assignment.manage`): max open leads, ack window (seconds), idle period (seconds), escalation levels (an editable list: add or remove a level, type, seconds), backup user, manager user, "Treat Google Calendar meetings as Busy" toggle, "Auto-reply to customer" toggle. Every change → audit.
- [ ] `eligibleUsers(ws, excludeIds)`: status AVAILABLE **and** open leads < max **and** (if the toggle is on) `!(await calendar.isBusyNow(userId))`. Open leads = leads with status ASSIGNED or ACKNOWLEDGED owned by the user.
- [ ] Round-robin: sort eligible users by id, start after `rrCursor`, and update the cursor **in the same transaction**.
- [ ] **Build a reason string while checking each user:** `"Skipped Ali (On leave) · Skipped Sara (5/5 open leads) · Skipped Bilal (in a meeting until 15:30) · Chose Hina (next in rotation)"`. Save it in `LeadAssignment.reason` and show it on the lead.
- [ ] Assign in a transaction: `updateMany({ where: { id, version }, data: { ownerId, status: ASSIGNED, assignedAt: now, firstAssignedAt: coalesce, deadlineAt: now + window, version: +1 } })`. **If count = 0, stop** (someone else changed it). Then add a LeadAssignment row, audit entry, timeline entry and an in-app Notification.
- [ ] If nobody is eligible: status UNASSIGNED, skip straight to the BACKUP/MANAGER level, and the lead appears in the recovery queue.

### 3.4 Acknowledgement: F3.4
- [ ] `leads.acknowledge(leadId, userId)`: only the current owner can do it. Conditional update → status ACKNOWLEDGED, set `acknowledgedAt` (and `firstAcknowledgedAt` if empty), `lastActionAt`, clear `deadlineAt`. Audit + timeline.
- [ ] `leads.markActed(contactId, userId, action)` (contract): if that contact has an open lead owned by this user and not yet acknowledged → acknowledge it. Always update `lastActionAt`.
- [ ] UI: `/leads` "My leads" with a **live countdown** (mm:ss, turning red under 10 seconds, with the text "Escalates in 0:08"), a big Acknowledge button, the source and the routing reason.
- [ ] `<LeadSlot contactId/>` for the contact page: current owner, status, countdown, assignment history.

### 3.5 Escalation chain + worker: F3.5, F3.8, Q5 (the most important code you write)
- [ ] `worker/index.ts`: a loop every 2 seconds that runs every job in `worker/registry.ts` (append-only; P3 adds the outbox retry job here).
- [ ] `escalationSweep()`:
  ```
  leads = SELECT id, version FROM Lead WHERE status='ASSIGNED' AND deadlineAt <= now() LIMIT 50
  for each lead: escalate(lead.id, lead.version)
  ```
- [ ] `escalate(id, version)`:
  - level = lead.escalationLevel + 1. Look up `levels[level-1]`.
  - NEXT_ELIGIBLE → `eligibleUsers(excluding everyone who already held it)`. BACKUP → backupUserId (if Available, or regardless if none is). MANAGER → managerUserId (always).
  - **Conditional update `where {id, version}`.** If count = 0, another sweep already handled it, so stop. **This is how F3.8 is guaranteed.**
  - New deadline = now + that level's seconds. `escalationCount++`. LeadAssignment kind ESCALATION, with the reason "Hina did not acknowledge within 60s".
  - After the last level: keep it with the manager and set status UNASSIGNED-overdue (it appears in the recovery queue).
  - Then call `notify.alert(newOwnerId, lead, reason)` (3.8).
- [ ] **Restart safety:** all state is in the DB, nothing is in memory. Demo: assign a lead, stop the worker with Ctrl+C, wait past the deadline, start it again → it escalates exactly once.
- [ ] **Double-run safety demo:** start 2 workers at the same time → each lead is still escalated once (thanks to the version check).
- [ ] Manual reassign (`leads.reassign`, needs `leads.reassign`): a "Reassign to ▼" menu on the lead. Kind MANUAL, counted separately from escalations.

### 3.6 Absence: F3.6
- [ ] `handleAbsence(userId)`: for each of their ASSIGNED (unacknowledged) leads → reassign right away with kind ABSENCE and the reason "Ali went On leave".
- [ ] **Defined policy for acknowledged leads (show this text in the UI):** *"Leads you have already acknowledged stay with you, but they are flagged 'Owner away' and appear in the recovery queue so a manager can reassign them."* Set `ownerOnLeaveFlag = true`.
- [ ] Show this policy as a notice inside the status selector when choosing On leave or Offline.

### 3.7 Recovery queue: F3.7
- [ ] `/recovery`: leads where (a) status ASSIGNED and `deadlineAt < now` (the worker hasn't run yet) or status UNASSIGNED, (b) `escalationCount >= 2`, (c) `lastActionAt` (or createdAt) older than `idleSeconds` and not closed, (d) `ownerOnLeaveFlag`.
- [ ] Each row shows a **reason chip** with text: "Unacknowledged 2m past window" / "Escalated 3 times" / "No action for 6m" / "Owner on leave", plus quick Reassign and Open buttons.
- [ ] One query function `recoveryQueue(ctx)` in `lib/metrics`, also used by the dashboard count (Q12).

### 3.8 Telegram notifications: F3.9, I4.1–I4.4
- [ ] Integrations: Telegram card (render it inside P3's integrations page through `<TelegramIntegrationCard/>` in `components/slots`). The Admin pastes the bot token → you call `setWebhook(url={APP_URL}/api/webhooks/telegram/{integrationId}, secret_token=random)`. Store the token and secret encrypted with P3's `secrets.encrypt()`.
- [ ] Per-user routing (I4.3): the profile page has a "Connect Telegram" button that opens `https://t.me/<bot>?start=<telegramLinkToken>`. The bot receives `/start <token>` → save `chat.id` on that user → reply "Connected to Amanat ✅". Also a "Send test alert" button.
- [ ] `notify.alert(userId, lead, reason)`: create a Notification (INAPP) **and** (if a chatId exists) a TELEGRAM Notification → send via `integrations.send("TELEGRAM", ...)` (P3's outbox, which handles retry and logging). Message:
  ```
  🔴 Lead escalated to you
  Lead: Ahmed Raza (+92 300…)
  Source: WhatsApp
  Reason: Hina did not acknowledge within 60s (level 2 of 3)
  You have 60s.
  [✅ Acknowledge]  [Open lead]
  ```
  (inline keyboard: a `callback_data: "ack:<leadId>"` button + a URL button `{APP_URL}/leads/<id>`).
- [ ] Webhook `/api/webhooks/telegram/[integrationId]`: check the `X-Telegram-Bot-Api-Secret-Token` header (otherwise 401 + log REJECTED). For `callback_query` → find the user by chat id → `leads.acknowledge` → `answerCallbackQuery("Acknowledged ✅")` and edit the message to say "Acknowledged by you at 14:03". If you are no longer the owner → "This lead has moved to Omar."
- [ ] Failures (I4.4): an outbox failure → Notification FAILED with the error, up to 3 retries (5s, 15s, 45s). Admin page `/integrations` shows failed alerts (P3's sync history table, filtered to provider TELEGRAM).

### 3.9 Live updates: Q11
- [ ] `/api/live?since=<ts>` returns new notifications, lead changes and incoming messages for this user since `ts`.
- [ ] `<LivePoller/>` in the layout polls every 3 seconds → shows sonner toasts ("New lead from WhatsApp", "Lead escalated to you") and calls SWR `mutate()` on the related keys. All lists use SWR with `refreshInterval: 3000`. A notification bell shows the unread count.

### 3.10 Filters and saved lists: F2.6, Q9
- [ ] `lib/filters`: a filter JSON `[{field:"stage", op:"in", value:[...]}, {field:"owner", op:"eq"}, {field:"tag", op:"has"}, {field:"createdAt", op:"between"}, {field:"cf.budget", op:"gt"}]` → a Prisma `where` (custom fields through JSON path filters). Fields are allowed from a fixed list (no injection).
- [ ] `<FilterBar entity/>` component that P1 drops onto the contacts and opportunities lists. You can combine 3 or more criteria and press "Save as list".
- [ ] `/lists/[id]`: **runs the saved filter fresh every time** (that's why it "updates automatically"), paginated, with SWR refresh.

### 3.11 Dashboard: F5.1–F5.5, Q12
- [ ] `lib/metrics/index.ts`: **the only place figures are calculated** (Section 7 definitions):
  - New leads today = leads with createdAt ≥ start of today (workspace timezone)
  - Open pipeline value by stage = sum of value where the stage kind is OPEN, grouped by stage (masked without `opportunity.value.view`)
  - Avg time to first response = avg(firstAcknowledgedAt − firstAssignedAt) for leads acknowledged in range
  - Recovery queue items = `recoveryQueue(ctx).length`
  - Escalations in the last 24h = count of LeadAssignment rows with kind ESCALATION (manual counted separately, shown underneath)
  - Employee availability = count by status + a list of names
  - Upcoming appointments = Appointment BOOKED/RESCHEDULED with startUtc > now (next 7 days)
  - Payments received this month = `payments.collected(ctx, monthRange)` (P3's function: paid minus refunds)
  - **Revenue at risk** (extra, labelled as such) = sum of the open opportunity value of contacts whose leads are past their deadline or unassigned
- [ ] F5.4: if the user lacks `dashboard.company` → every query adds `ownerId = me`, and the title says "My performance".
- [ ] F5.3: tiles are links → `/leads?filter=today`, `/recovery`, `/opportunities?stage=X`, `/payments?month=current`, `/leads?filter=escalated24h`. The lists use **the same functions**, so the numbers match (Q12).
- [ ] F5.5: a "Customize" button with checkboxes for each tile → saved in `DashboardPref`.

---

## 4. P3: Integrations (Twilio, Stripe, Google, the I5 framework)

**Owns:** I1.1–I1.9, I2.1–I2.8, I3.1–I3.7, I5.1–I5.8, fault-test panel, Q14 (integration layer).

### 4.1 Integration framework: I5 (by T+0:50; others depend on it)
- [ ] `lib/integrations/secrets.ts`: AES-256-GCM `encrypt/decrypt` with `ENCRYPTION_KEY` from env. `mask("sk_test_abc...xyz")` → `"sk_test_••••xyz"`. **Never** return decrypted secrets to the client (I5.3).
- [ ] `lib/integrations/log.ts` → `logEvent({workspaceId, provider, direction, type, externalId, status, payload, error})`. Redact the payload (remove auth headers, tokens and anything card-like).
- [ ] `lib/integrations/outbox.ts` → `integrations.send(provider, workspaceId, job)` (contract): writes an IntegrationEvent OUT with status RETRYING and tries immediately. On failure:
  - **Temporary** (network error, timeout, 429, 5xx) → `nextAttemptAt = now + 5s·3^attempts`, max 4 attempts (I5.5).
  - **Permanent** (4xx such as invalid number, opted out, bad token) → FAILED with a **plain explanation** from `explainError(provider, code)`, e.g. Twilio 63016 → "This customer has not messaged in the last 24 hours, so WhatsApp only allows template messages." Twilio 63015/sandbox → "This phone has not joined the sandbox. Ask the customer to send 'join <code>' first."
  - Add `outboxRetryJob` to `worker/registry.ts`.
- [ ] Every provider call has a timeout (10s) and try/catch. A failure updates `Integration.status = ERROR, lastError` and **never throws into other features** (I5.8).
- [ ] `/integrations` page (I5.1, I5.6, I5.7): one card per provider: status chip (Not connected, Connected, Error), "Last worked 2 min ago", the last 5 errors, masked credentials, Connect/Edit/Disconnect (needs `integrations.manage`, otherwise read-only; server enforced) → `audit.record("integration.*")`. Each card has a **"What this can and can't do"** box:
  - Twilio: "Sandbox only reaches phones that sent the join code. Free-form replies only within 24h of the customer's last message."
  - Stripe: "Test mode only. Use card 4242 4242 4242 4242. Card details are entered only on Stripe's page; Amanat never sees them."
  - Google: "App in testing mode; only listed test users can connect. Connections may need reconnecting after 7 days."
  - Telegram: "Each employee must press Start on the bot once to receive alerts."
- [ ] `/integrations/history` (I5.4): a paginated table of IntegrationEvents (time, provider, direction, type, reference, status, error), filterable. Needs `integrations.manage` or `audit.view`.
- [ ] I5.2: webhook URLs include the integration id (`/api/webhooks/twilio/{integrationId}`), so each workspace's secret verifies its own requests. **One workspace's credentials are never loaded for another.**

### 4.2 Twilio WhatsApp: I1
- [ ] Connect form: Account SID, Auth Token, Sandbox number (`whatsapp:+14155238886`). Shows the webhook URL to paste into the Twilio console ("When a message comes in").
- [ ] **Inbound** `/api/webhooks/twilio/[integrationId]` (I1.1, I1.2, I1.5, I1.8):
  1. Validate `X-Twilio-Signature` with `twilio.validateRequest(authToken, signature, fullUrl, params)`. Careful: the URL must be the exact public URL (use `APP_URL`, not the request host, behind a proxy). If invalid → 403 + `logEvent(REJECTED, "Invalid signature")` + audit entry.
  2. `externalId = MessageSid`. Insert the IntegrationEvent. If there is a **unique violation → return 200, do nothing** (duplicate).
  3. Find the contact by `From` phone (E.164) in this workspace. Not found → create the contact + `leads.intake(source: WHATSAPP)`. Found → if they have no open lead, create one; otherwise attach.
  4. Find or create the Conversation and insert the Message (IN). Add a timeline entry.
  5. If the body is `STOP` → set `optedOut = true` + timeline entry "Customer opted out".
  6. **Customer auto-reply (the signature feature):** if a new lead was created and `autoReplyCustomer` is on → send "Thank you for contacting {Company}. {OwnerName} will reply within {N} minutes." On escalation P2 can call `messaging.notifyHandoff(contactId, newOwnerName)` → "{Old} is unavailable; {New} is now handling your request."
  7. Return empty TwiML `<Response/>`.
- [ ] **Outbound** (I1.3, I1.4, I1.7, I1.9): `messaging.send(conversationId, body, userId)`:
  - If the contact is opted out → 409 "Ahmed opted out on 12 Oct. Messages are blocked to respect their choice." The composer is disabled with that text.
  - Insert the Message as QUEUED → send through the outbox with `statusCallback = {APP_URL}/api/webhooks/twilio/{id}/status`.
  - Status webhook (also signature-checked, deduped by `MessageSid+MessageStatus`) → update the status to SENT, DELIVERED, READ or FAILED with `ErrorCode` + `explainError()`.
  - Failed message bubble: red outline + icon + text "Failed: <reason>" + a **Retry** button.
  - Sending a message calls `leads.markActed(contactId, userId, "message")`.
- [ ] `/inbox`: a list of conversations (assignee, last message, unread) + the thread view. **Visibility (I1.6):** Users see only conversations where they are the assignee or the contact owner, unless they have `crm.view` + `dashboard.company`. The assignee is shown in the header and is changeable by a manager.
- [ ] `<ConversationSlot contactId/>` for the contact page.

### 4.3 Stripe: I2
- [ ] Connect form: secret key (`sk_test_…` only; **reject `sk_live_`**), webhook signing secret (`whsec_…`). Shows the webhook URL and the list of events to enable.
- [ ] `<PaymentRequestSlot opportunityId/>` (I2.1, I2.7): amount (defaults to the opportunity value), currency (PKR/USD) → `stripe.checkout.sessions.create({ mode:"payment", line_items:[{price_data:{currency, unit_amount, product_data:{name: opp.title}}, quantity:1}], metadata:{workspaceId, paymentId, opportunityId}, expires_at: now+30min, success_url, cancel_url })` → save the Payment (PENDING, requestedById, stripeSessionId, url). Buttons: **Copy link** and **Send on WhatsApp** (uses `messaging.send`). Needs `payments.request`.
- [ ] Webhook `/api/webhooks/stripe/[integrationId]` (I2.2, I2.3, I2.4, I2.5):
  1. Read the **raw body** (`await req.text()`), `stripe.webhooks.constructEvent(raw, sig, whsec)`. If it fails → 400 + log REJECTED. **No DB change before this.**
  2. `externalId = event.id`. Insert IntegrationEvent; on unique violation → 200, stop.
  3. Handle:
     - `checkout.session.completed` (payment_status = paid) → PAID, paidAt, paymentIntentId
     - `checkout.session.async_payment_failed` / `payment_intent.payment_failed` → FAILED
     - `checkout.session.expired` → EXPIRED
     - `charge.refunded` → refundedAmount = amount_refunded → REFUNDED or PARTIALLY_REFUNDED
  4. Timeline entry on the contact and opportunity + `realtime` picks it up through polling (the page updates without a refresh).
- [ ] **Abandoned (I2.5):** a sweeper job marks PENDING sessions older than `ABANDON_SECONDS` (configurable, e.g. 120s in the demo) as ABANDONED. Explain in a tooltip: "Customer opened the link but did not pay." If they pay later, the webhook still sets PAID.
- [ ] **Expire button** (for the demo): calls `stripe.checkout.sessions.expire(id)` → the real `expired` webhook arrives.
- [ ] `payments.collected(ctx, range)` (contract, I2.6) = sum(amount where PAID or partially refunded, paidAt in range) − sum(refundedAmount). `payments.projected(ctx)` = open opportunities + PENDING payments. Both are labelled clearly in the UI.
- [ ] `/payments` list + `<PaymentsSlot contactId/>`: amount, status chip (text + icon), opportunity, contact, requested by, **Stripe reference** (`cs_test_…` / `pi_…`, linking to the Stripe dashboard), dates.
- [ ] I2.8: never touch card data. Grep the repo for "card" before submission. Card entry happens only on Stripe's hosted page.
- [ ] Demo helper: `stripe listen --forward-to localhost:3000/api/webhooks/stripe/<id>` locally; on Railway use the dashboard endpoint. `stripe events resend <evt_id>` shows that duplicates are ignored.

### 4.4 Google Calendar: I3
- [ ] `/settings/calendar` (I3.1): "Connect Google Calendar" → OAuth URL (`access_type=offline, prompt=consent`, scopes `calendar.events` + `calendar.readonly` (for free/busy) + `openid email`), a signed `state` (userId + nonce, to prevent CSRF). The callback exchanges the code → stores the **encrypted refresh token** (I3.2, server only). A "Disconnect" button → revoke at Google + delete the row + audit.
- [ ] `getCalendarClient(userId)`: an OAuth2 client with the stored tokens; listen to the `on("tokens")` event to save refreshed access tokens (auto refresh). On an `invalid_grant` error → status NEEDS_RECONNECT + an in-app banner "Your Google Calendar connection expired. Reconnect."
- [ ] `calendar.isBusyNow(userId)` (contract for P2): `freebusy.query` for [now, now+1min]. Cache for 60s. Return `{busy, until}` or `false` if not connected.
- [ ] `<BookAppointmentSlot/>` (I3.3, I3.4, I3.5, I3.7):
  - Employee dropdown → anyone without a connected calendar is **disabled** with the text "Not bookable: Google Calendar not connected" (I3.7).
  - Date and time picker in **the employee's timezone** (shown, e.g. "Times in Asia/Karachi (UTC+5)").
  - When a slot is chosen → `freebusy.query` → overlap → a warning "Hina is busy 15:00–15:30. Pick another time" and Book stays disabled until the time changes (or "Book anyway" for managers).
  - Book → `events.insert({ summary: "Amanat: <contact> – <opp>", start:{dateTime, timeZone}, end, description: link to the contact })` → Appointment (startUtc stored as `timestamptz`, plus the IANA timezone) + timeline entry + `leads.markActed(...,"appointment")`.
- [ ] Reschedule / Cancel (I3.6): `events.patch` / `events.delete` → update the Appointment + timeline entry "Rescheduled from 15:00 to 16:00 by Hina".
- [ ] `<AppointmentsSlot contactId/>`: shows the time in the viewer's timezone + the employee's timezone if different.
- [ ] Admin view (I3.7): on `/integrations`, a Google card table: each employee → Connected / Needs reconnect / Not connected.

### 4.5 Fault-test panel (Owner only, after T+3:00 if time allows)
- [ ] `/integrations/fault-lab`, only when `DEMO_MODE=true` **and** level OWNER:
  - "Resend last Stripe event twice" (POST the same signed payload to your own webhook twice) → the payment is recorded once.
  - "Send forged Twilio webhook" (wrong signature) → rejected, appears in the history as REJECTED.
  - "Break Telegram" (temporarily use a bad token) → alerts fail, retry, and show as FAILED.
- [ ] If there's no time: show the same three things with `curl` in a terminal.

---

## 5. Contracts (P1 creates these as stubs at T+0:30; the owner fills them in)

`lib/shared/contracts.ts` re-exports these; **signatures never change** without telling the team.

| Function | Owner | Stub returns | Used by |
|---|---|---|---|
| `requireUser()`, `requirePermission(ctx, p)`, `scoped(ctx)` | P1 | real by T+0:30 | all |
| `audit.record(input)` | P1 | `console.log` | all |
| `timeline.add(input)` | P1 | no-op | P2, P3 |
| `leads.intake({workspaceId, contactId, source})` | P2 | create the Lead row only | P3 (WhatsApp) |
| `leads.markActed(contactId, userId, action)` | P2 | no-op | P1 (notes, stages), P3 (messages, appts) |
| `notify.alert(userId, lead, reason)` | P2 | no-op | P2 |
| `metrics.*`, `recoveryQueue(ctx)` | P2 | zeros | P2 dashboard |
| `calendar.isBusyNow(userId)` | P3 | `false` | P2 |
| `payments.collected(ctx, range)`, `payments.projected(ctx)` | P3 | `0` | P2 dashboard |
| `messaging.send(...)`, `messaging.notifyHandoff(contactId, name)` | P3 | no-op | P2 |
| `integrations.send(provider, workspaceId, job)`, `secrets.encrypt/decrypt` | P3 | send directly / identity | P2 (Telegram) |

**Slot components** (`components/slots/`; P1 creates empty files, the owner fills them in): `LeadSlot` (P2), `ConversationSlot`, `PaymentsSlot`, `AppointmentsSlot`, `PaymentRequestSlot`, `BookAppointmentSlot` (P3), `TelegramIntegrationCard` (P2), `FilterBar` (P2).

---

## 6. Timeline

| Time | P1 | P2 | P3 |
|---|---|---|---|
| 0:00–0:30 | Skeleton, schema, auth stub, contracts | Telegram bot, Railway, DB | Twilio, Stripe, Google accounts, ngrok |
| **0:30 merge** | push skeleton | pull | pull |
| 0:30–1:15 | Real auth, sessions, rate limit, users, roles, permissions | Intake (form, manual), availability, assignment + reasons | Secrets, log, outbox, `/integrations` page, Twilio inbound |
| **1:15 merge** | | | deploy to Railway |
| 1:15–2:00 | CRM entities, custom fields, masking, export | Worker, escalation, ack, countdown, absence | Twilio outbound, status, opt-out, inbox, auto-reply |
| **2:00 merge** | | | |
| 2:00–2:45 | Pipeline settings, board, required fields, versioning | Telegram link + alert + Ack button, recovery queue, live poller | Stripe full flow + refunds + abandoned |
| **2:45 merge** | | | |
| 2:45–3:20 | Audit chain + Verify, timeline, contact page, responsive pass | Dashboard + drill-down + customize, filters + saved lists | Google OAuth, book, freebusy, reschedule, cancel, `isBusyNow` |
| **3:20 merge** | | | |
| 3:20–3:30 | Seed data, README, security-check.sh | Turn on calendar-busy routing, demo timers set to 30s | Fault-lab (or curl scripts), history page |
| **3:30 FREEZE** | Full demo run-through on the deployed URL, fix only real bugs | | |
| 3:45–4:00 | Final README, `.env.example` check, submit | | |

If someone falls behind: **P1 is the most likely**, because CRM is wide. At T+2:45, whoever is ahead takes the **contact page (2.8)** or **filters (3.10)**. These are self-contained.

---

## 7. Coverage check: every requirement has an owner

| Req | Owner | Req | Owner | Req | Owner |
|---|---|---|---|---|---|
| F1.1–F1.6 | P1 | I1.1–I1.9 | P3 | Q1 auth | P1 |
| F2.1–F2.5 | P1 | I2.1–I2.8 | P3 | Q2 authz | P1 (helpers) + all |
| F2.6 | P2 | I3.1–I3.7 | P3 | Q3 input | all (Zod), P1 (CSRF) |
| F2.7, F2.8 | P1 (+slots) | I4.1–I4.4 | P2 | Q4 integrity | P1 (versions), all |
| F3.1–F3.9 | P2 | I5.1–I5.8 | P3 | Q5 concurrency | P2 (timers), P3 (webhooks) |
| F4.1–F4.3 | P1 | Fault lab | P3 | Q6 persistence | P1 |
| F5.1–F5.5 | P2 | | | Q7, Q8, Q10 | P1 (components), all |
| | | | | Q9 | P1 (pagination), P2 (filters) |
| | | | | Q11, Q12 | P2 |
| | | | | Q13 | P1 (README, seed), all (sections) |
| | | | | Q14 | all (folder structure) |

---

## 8. Demo plan (5 minutes, rehearse twice)

1. **Isolation and permissions:** log in as a User → opportunity values masked → run `security-check.sh` (403, 404, 401).
2. **WhatsApp lead:** send "Hi, need solar quote" from a phone → the lead appears live, the routing reason is shown, the **customer's phone gets "Hina will reply within 1 minute."**
3. **Escalation:** ignore it → the countdown hits 0 → it moves to Omar → **Omar's Telegram buzzes → he taps Acknowledge** → the app updates live. Revenue at risk goes up, then down.
4. **Absence:** set Hina to On leave → her leads move instantly, with the policy notice shown.
5. **CRM:** add a custom field "Roof size" → it appears immediately → try to move to Proposal → blocked "Fill Roof size first".
6. **Payment:** request PKR 50,000 → send on WhatsApp → pay with 4242… → PAID appears without a refresh → refund in the Stripe dashboard → collected revenue drops.
7. **Calendar:** book → conflict warning → book a free slot → it appears in real Google Calendar.
8. **Proof:** fault lab (duplicate Stripe event, forged Twilio request) → stop the worker during a countdown, restart it → escalates once → **edit an audit row in psql → Verify history → red.**

Closing line: *"Every lead is an amanat. In Amanat, someone is always holding it, and we can prove who."*

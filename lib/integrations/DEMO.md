# Amanat — judge demo run (about 14 minutes)

Login: workspace `sunrise-solar`, `owner@sunrise.test` / `password123`.
Sales role (for the masking step): `hina@sunrise.test` / `password123`.
Say **"simulator"** out loud whenever you use one. Everything marked LIVE uses the real provider.

## Before you start (10 minutes, do it once)
- Railway: **web** and **worker** both running; `APP_URL` is the https URL; `ENCRYPTION_KEY` set; `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set with no spaces.
- `/integrations`: WhatsApp, Stripe, Google and Telegram show **Connected**. Press **Check now** on each.
- Your phone has joined the WhatsApp sandbox (send `join <your-word>` to the sandbox number).
- Judge's Gmail is a **test user** in Google Cloud (testing apps only allow listed accounts; tokens can expire after 7 days).
- Telegram chat linked, **Send test alert** works.
- Pay once with the Stripe test card so you know it works. Redeploy once and check the data is still there.

## Run of show
| Time | Do this | You should see | Say this | If it breaks |
|---|---|---|---|---|
| 0:00 | Log in as owner, open **Dashboard** | Live numbers, refreshes every 3 s | "Every figure is computed in one place and matches the problem statement's definitions." | Reload |
| 1:30 | Open the public form `/f/…`, submit a lead | Lead appears with an owner and a countdown | "The deadline is stored in the database, not a browser timer, so a restart loses nothing." | Use a seeded lead |
| 3:00 | Leave it unanswered until the deadline | Lead moves to the next level; Telegram alert arrives (LIVE) | "A worker sweeps overdue leads. Two workers cannot escalate the same lead twice." | Show the earlier escalation in the audit log |
| 4:30 | Open **Audit log**, press **Verify** | "Chain intact" | "Each entry carries the hash of the one before. The database refuses edits and deletes." | Show the explanation only |
| 5:30 | From your phone send a WhatsApp message (LIVE) | It appears in **Inbox** within ~5 s, linked to a contact | "The signature is checked before any data is touched. Duplicate deliveries are ignored." | Website chat widget on the form page |
| 6:30 | Reply from the Inbox | Your phone receives it | "Failed sends retry with backoff and show a plain reason." | Show a failed message in **Sync history** |
| 7:30 | **Payments** → create a payment request, pay with `4242 4242 4242 4242` (LIVE) | Status flips to Paid; timeline entry | "Amanat never sees card details. A repeated webhook is counted once." | Dev simulator `pay` (say "simulator") |
| 9:00 | **Calendar** → book a visit for the judge (LIVE) | Event is in Google Calendar | "Times are stored in UTC with the workspace's time zone." | Demo calendar (say so) |
| 10:00 | Try to book an overlapping time | The app refuses and says why | "Conflicts come from Google free/busy." | — |
| 11:00 | **Integrations** → Sync history | Each event with status | "One provider failing never blocks the others." | — |
| 12:00 | Log in as Hina (Sales) in a private window | Opportunity values hidden | "Masking is server-side: lists, details and exports." | Skip |
| 13:00 | **Settings → Pipelines** delete a stage with opportunities | A dialog asks where to move them | "Nothing is orphaned and it is audited." | Skip |

## Questions to expect
- *Where is isolation enforced?* Every query goes through `scoped(ctx)`; another workspace's id gives 404.
- *Why no `setTimeout`?* Timers are `Lead.deadlineAt` in Postgres; the worker polls.
- *Webhook order?* Verify signature → dedupe on provider event id → process → log an `IntegrationEvent`.
- *Where are secrets?* Encrypted at rest (AES-256-GCM), decrypted only on the server, shown masked.

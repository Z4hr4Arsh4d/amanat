# Amanat — instructions for Claude Code

Hackathon project, **4-hour build**, 3 people working in parallel on one repo. Speed matters, but every functional requirement must be met. The full spec, per-person checklists and contracts are in **PLAN.md** — read the section for the person you are helping before writing code.

## Who owns what
| Part | Person | PLAN.md section | Branch prefix |
|---|---|---|---|
| P1 Records (auth, roles, CRM, custom fields, pipeline, audit) | Zahra | §2 | `p1/` |
| P2 Lead engine (intake, assignment, escalation, worker, recovery, dashboard, Telegram, saved lists) | Hadia | §3 | `p2/` |
| P3 Integrations (Twilio WhatsApp, Stripe, Google Calendar, integrations page, sync history) | Imtiaz | §4 | `p3/` |

Ask the user which part they own if it is not clear, then stay inside it.

## Hard rules (merge safety)
1. **Only edit files in your part's folders** (PLAN.md §0 table). If a change in someone else's folder seems needed, stop and tell the user instead.
2. **Append-only shared files:** `lib/shared/*`, `components/slots/*` (only the owner fills a slot), `worker/registry.ts`, `.env.example`, `README.md` (own section only). Add lines at the end; never edit or reorder existing lines.
3. **Cross-part calls go only through `lib/shared/contracts.ts`.** Never change a contract's signature. Fill in bodies only for contracts your part owns.
4. **Schema is frozen** (`prisma/schema.prisma`). Only add new optional columns (or columns with defaults) to models in your part's section. No new migration files — use `npm run db:push`.
5. Before every commit: `npm run typecheck` and `npm run lint` must pass. Commit small and often on your branch; merge to `main` at the checkpoints (T+0:30, 1:15, 2:00, 2:45, 3:20).

## Code rules (these are graded requirements)
- Every API route / server action: `const ctx = await requireUser(); requirePermission(ctx, "<perm>")`, then **all** DB access via `scoped(ctx)` (auto-filters by workspace). Another workspace's id must give **404**. Raw `prisma` only in webhooks and the worker, scoped by hand.
- Validate every input on the server with Zod. Never `dangerouslySetInnerHTML`.
- Optimistic concurrency: updates use `where: { id, version }` + `version: { increment: 1 }`; 0 rows → 409 with a clear message.
- Timers live in the DB (`deadlineAt`), never `setTimeout`. Worker jobs must be safe if run twice at once.
- Webhooks: verify the provider signature **before** touching data → dedupe on provider event id (unique index; duplicate → return 200, do nothing) → process → log an `IntegrationEvent`.
- Secrets: encrypt with `lib/integrations/secrets.ts`; never send to the browser; show `mask()`.
- Record important actions with `audit.record(...)` and customer-facing history with `timeline.add(...)`.
- Metrics follow PLAN.md / problem statement Section 7 definitions exactly, computed only in `lib/metrics`.
- UI: Tailwind; must work at 375px width with no sideways scroll; labelled inputs; keyboard usable; never color alone (text + icon); every action shows loading, success and failure (sonner toasts); live data via SWR `refreshInterval: 3000`.
- Plain, simple language in all UI text and error messages; errors say what went wrong and what to do.

## Commands
`npm run dev` · `npm run worker` · `npm run db:setup` · `npm run seed` · `npm run typecheck` · `npm run lint`
Seed login: workspace `sunrise-solar`, `owner@sunrise.test` / `password123`.

## Stack
Next.js 15 App Router, TypeScript, Prisma 6 + PostgreSQL, Tailwind 4, Zod 4, SWR, sonner, bcryptjs. Node libraries to add per part: P3 `twilio stripe googleapis`; P2 none required (Telegram via fetch).

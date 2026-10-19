// P1 owns. F4.1 audit history: filter by event type, user and date; expand to see before/after.
// There is no edit or delete anywhere (F4.3).
import type { Prisma } from "@prisma/client";
import { requireUserPage, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NoAccess } from "@/components/ui/NoAccess";
import { Pagination } from "@/components/ui/Pagination";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, PageHeader } from "@/components/ui/Kit";
import { PAGE_SIZE, pageFrom, qFrom } from "@/lib/crm/people";
import { VerifyButton } from "./VerifyButton";

type J = Prisma.JsonValue;
const show = (v: unknown) => (v === undefined ? "—" : v === null ? "(empty)" : typeof v === "object" ? JSON.stringify(v) : String(v));

function Diff({ before, after }: { before: J; after: J }) {
  const b = (before && typeof before === "object" && !Array.isArray(before) ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" && !Array.isArray(after) ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  if (keys.length === 0) return <p className="text-xs text-stone-600">No details recorded.</p>;
  return (
    <div className="relative overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full min-w-[28rem] text-left text-xs">
        <thead className="bg-stone-50"><tr className="text-stone-500"><th scope="col" className="px-3 py-2 font-semibold">Field</th><th scope="col" className="px-3 py-2 font-semibold">Before</th><th scope="col" className="px-3 py-2 font-semibold">After</th></tr></thead>
        <tbody>
          {keys.map((k) => {
            const changed = JSON.stringify(b[k]) !== JSON.stringify(a[k]);
            return (
              <tr key={k} className="border-t border-stone-100 align-top">
                <td className="px-3 py-2 font-semibold text-stone-800">{k}</td>
                <td className={`break-all px-3 py-2 font-mono ${changed && k in b ? "bg-red-50/60 text-red-800" : "text-stone-600"}`}>{k in b ? show(b[k]) : "—"}</td>
                <td className={`break-all px-3 py-2 font-mono ${changed && k in a ? "bg-emerald-50/60 text-emerald-800" : "text-stone-600"}`}>{k in a ? show(a[k]) : "—"} {changed && <span className="sr-only">(changed)</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireUserPage();
  if (!can(ctx, "audit.view")) return <NoAccess what="view the audit history" />;
  const sp = await searchParams;
  const action = qFrom(sp.action);
  const actor = qFrom(sp.actor);
  const from = qFrom(sp.from);
  const to = qFrom(sp.to);
  const page = pageFrom(sp.page);
  const db = scoped(ctx);
  const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  const createdAt: Prisma.DateTimeFilter = {};
  if (validDate(from)) createdAt.gte = new Date(`${from}T00:00:00.000Z`);
  if (validDate(to)) createdAt.lt = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 864e5);
  const where: Prisma.AuditLogWhereInput = {
    ...(action ? (action.endsWith(".*") ? { action: { startsWith: action.slice(0, -1) } } : { action }) : {}),
    ...(actor === "system" ? { actorId: null } : actor ? { actorId: actor } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };
  const [total, rows, actions, users] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { seq: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const groups = [...new Set(actions.map((a) => a.action.split(".")[0]))];
  const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: ctx.timezone });
  const params: Record<string, string> = {};
  if (action) params.action = action;
  if (actor) params.actor = actor;
  if (from) params.from = from;
  if (to) params.to = to;

  return (
    <section className="space-y-6">
      <AutoRefresh seconds={10} />
      <PageHeader
        title="Audit history"
        description="Every important change, who made it and when. Entries can't be edited or deleted, and each one is chained to the one before it, so any tampering is detected."
      />
      <div className={`${ui.card} flex flex-col gap-3 sm:flex-row sm:items-start`}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon name="shield" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className={ui.h2}>Check the chain</h2>
            <p className={`${ui.muted} mt-0.5`}>Recalculates every entry&apos;s fingerprint to prove nothing has been changed or removed.</p>
          </div>
          <VerifyButton />
        </div>
      </div>

      <form className={`${ui.card} grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end`}>
        <div className={ui.field}>
          <label htmlFor="f-action" className={ui.labelSm}>Event type</label>
          <select id="f-action" name="action" defaultValue={action} className={ui.input}>
            <option value="">All events</option>
            {groups.map((g) => <option key={g} value={`${g}.*`}>All {g} events</option>)}
            {actions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
          </select>
        </div>
        <div className={ui.field}>
          <label htmlFor="f-actor" className={ui.labelSm}>Done by</label>
          <select id="f-actor" name="actor" defaultValue={actor} className={ui.input}>
            <option value="">Anyone</option>
            <option value="system">System (automatic)</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className={ui.field}>
          <label htmlFor="f-from" className={ui.labelSm}>From</label>
          <input id="f-from" type="date" name="from" defaultValue={from} className={ui.input} />
        </div>
        <div className={ui.field}>
          <label htmlFor="f-to" className={ui.labelSm}>To</label>
          <input id="f-to" type="date" name="to" defaultValue={to} className={ui.input} />
        </div>
        <div className="flex gap-2">
          <button className={ui.btnPrimary}><Icon name="filter" className="h-4 w-4" />Filter</button>
          <a href="/audit" className={ui.btnGhost}>Clear</a>
        </div>
      </form>

      {rows.length === 0 ? <EmptyState icon="shield" title="No entries match">Try a wider date range or another event type.</EmptyState> : (
        <ol className={`${ui.cardFlush} divide-y divide-stone-100`}>
          {rows.map((r) => (
            <li key={r.id}>
              <details className="group">
                <summary className="flex list-none flex-col gap-1 px-5 py-3.5 text-sm transition-colors hover:bg-stone-50 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-14 shrink-0 font-mono text-xs text-stone-400">#{r.seq}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-stone-900">{r.action}</span>
                    <span className="block break-words text-xs text-stone-600 sm:inline sm:pl-2">
                      by {r.actorId ? r.actorLabel : <span className="inline-flex items-center gap-1"><Icon name="refresh" className="h-3 w-3" />{r.actorLabel}</span>} · {r.targetType}{r.targetId ? ` ${r.targetId.slice(0, 10)}…` : ""}
                    </span>
                  </span>
                  <time dateTime={r.createdAt.toISOString()} className="shrink-0 text-xs tabular-nums text-stone-500">{fmt.format(r.createdAt)}</time>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-800">
                    <span className="group-open:hidden">Show details</span><span className="hidden group-open:inline">Hide details</span>
                    <Icon name="chevronDown" className="chevron h-3.5 w-3.5 transition-transform" />
                  </span>
                </summary>
                <div className="space-y-2 px-5 pb-4">
                  <Diff before={r.before} after={r.after} />
                  <p className="break-all font-mono text-[11px] text-stone-500">hash {r.hash} · previous {r.prevHash}</p>
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/audit" params={params} />
    </section>
  );
}

// P1 owns. F4.1 audit history: filter by event type, user and date; expand to see before/after.
// There is no edit or delete anywhere (F4.3).
import type { Prisma } from "@prisma/client";
import { requireUserPage, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NoAccess } from "@/components/ui/NoAccess";
import { Pagination } from "@/components/ui/Pagination";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { ui } from "@/components/ui/styles";
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-xs">
        <thead><tr className="text-stone-600"><th className="py-1 pr-3">Field</th><th className="py-1 pr-3">Before</th><th className="py-1">After</th></tr></thead>
        <tbody>
          {keys.map((k) => {
            const changed = JSON.stringify(b[k]) !== JSON.stringify(a[k]);
            return (
              <tr key={k} className="border-t border-stone-200 align-top">
                <td className="py-1 pr-3 font-medium">{k}</td>
                <td className={`break-all py-1 pr-3 ${changed && k in b ? "text-red-800" : ""}`}>{k in b ? show(b[k]) : "—"}</td>
                <td className={`break-all py-1 ${changed && k in a ? "text-emerald-800" : ""}`}>{k in a ? show(a[k]) : "—"} {changed && <span className="sr-only">(changed)</span>}</td>
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
    <section className="space-y-4">
      <AutoRefresh seconds={10} />
      <div>
        <h1 className={ui.h1}>Audit history</h1>
        <p className={ui.muted}>
          Every important change, who made it and when. Entries can&apos;t be edited or deleted, and each one is chained to
          the one before it, so any tampering is detected.
        </p>
      </div>
      <div className={ui.card}><VerifyButton /></div>

      <form className={`${ui.card} grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end`}>
        <div className="space-y-1">
          <label htmlFor="f-action" className={ui.label}>Event type</label>
          <select id="f-action" name="action" defaultValue={action} className={ui.input}>
            <option value="">All events</option>
            {groups.map((g) => <option key={g} value={`${g}.*`}>All {g} events</option>)}
            {actions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="f-actor" className={ui.label}>Done by</label>
          <select id="f-actor" name="actor" defaultValue={actor} className={ui.input}>
            <option value="">Anyone</option>
            <option value="system">System (automatic)</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="f-from" className={ui.label}>From</label>
          <input id="f-from" type="date" name="from" defaultValue={from} className={ui.input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="f-to" className={ui.label}>To</label>
          <input id="f-to" type="date" name="to" defaultValue={to} className={ui.input} />
        </div>
        <div className="flex gap-2">
          <button className={ui.btnPrimary}>Filter</button>
          <a href="/audit" className={ui.btn}>Clear</a>
        </div>
      </form>

      {rows.length === 0 ? <p className={ui.muted}>No entries match.</p> : (
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className={`${ui.card} p-3`}>
              <details>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="font-mono text-xs text-stone-500">#{r.seq}</span>
                    <span className="font-medium">{r.action}</span>
                    <span className="min-w-0 break-words text-stone-700">
                      by {r.actorId ? r.actorLabel : `⚙ ${r.actorLabel}`} · {r.targetType}{r.targetId ? ` ${r.targetId.slice(0, 10)}…` : ""}
                    </span>
                    <time dateTime={r.createdAt.toISOString()} className="text-xs text-stone-600 sm:ml-auto">{fmt.format(r.createdAt)}</time>
                  </div>
                  <span className="text-xs text-emerald-800 underline">Show details</span>
                </summary>
                <div className="mt-3 space-y-2">
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

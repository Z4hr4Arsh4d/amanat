"use client";
// P2 owns. Dashboard tiles (F5.1–F5.5). Each tile links to the list behind it; refreshes every 3 seconds.
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Avatar, Notice, PageHeader } from "@/components/ui/Kit";
import { Spinner } from "@/components/ui/Spinner";
import { STATUS_DOT } from "../leads/StatusSelector";
import { getDashboard, saveDashboardPrefs, type DashboardData } from "./actions";
import { TILES } from "./tiles";

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function duration(s: number | null): string {
  if (s === null) return "No data yet";
  const r = Math.round(s);
  if (r < 60) return `${r}s`;
  if (r < 3600) return `${Math.floor(r / 60)}m ${r % 60}s`;
  return `${Math.floor(r / 3600)}h ${Math.floor((r % 3600) / 60)}m`;
}

const STATUS_LABEL = { AVAILABLE: "Available", BUSY: "Busy", ON_LEAVE: "On leave", OFFLINE: "Offline" } as const;

function Tile({ title, href, icon, tone = "stone", children, note }: {
  title: string; href?: string; icon: IconName; tone?: "stone" | "emerald" | "amber" | "red" | "sky"; children: React.ReactNode; note?: React.ReactNode;
}) {
  const chip = {
    stone: "bg-stone-100 text-stone-600", emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700", sky: "bg-sky-50 text-sky-700",
  }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-stone-600">{title}</h2>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${chip}`}><Icon name={icon} className="h-4 w-4" /></span>
      </div>
      <div className="mt-2 text-[1.7rem] font-bold leading-tight tracking-tight text-stone-900 tabular-nums">{children}</div>
      {note && <div className="mt-1.5 text-xs leading-5 text-stone-600">{note}</div>}
      {href && (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 opacity-80 transition-opacity group-hover:opacity-100">
          View list <Icon name="arrowRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </>
  );
  const box = "group flex flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-xs";
  return href ? (
    <Link href={href} className={`${box} transition-[border-color,box-shadow] hover:border-stone-300 hover:shadow-md`}>{body}</Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

export function DashboardClient() {
  const { data, error, mutate } = useSWR("dashboard", async () => {
    const r = await getDashboard();
    if (!r.ok) throw new Error(r.error);
    return { d: r.data, at: Date.now() };
  }, { refreshInterval: 3000 });
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  if (error && !data) return <Notice tone="bad" title="Could not load the dashboard.">{error.message} This page retries on its own.</Notice>;
  if (!data) {
    return (
      <div className="space-y-6" aria-busy="true">
        <p className="sr-only" role="status">Loading dashboard…</p>
        <div className="h-9 w-48 animate-pulse rounded-lg bg-stone-200/70" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-xl border border-stone-200 bg-white" />)}
        </div>
      </div>
    );
  }
  const d: DashboardData = data.d;
  const show = (id: string) => !d.hidden.includes(id);

  // Group the pipeline rows by stage (one row per stage, one amount per currency).
  const stages: { id: string; name: string; count: number; values: string[] }[] = [];
  for (const p of d.pipeline) {
    let s = stages.find((x) => x.id === p.stageId);
    if (!s) { s = { id: p.stageId, name: p.stage, count: 0, values: [] }; stages.push(s); }
    s.count += p.count;
    s.values.push(p.value === null ? "•••••" : `${p.currency} ${num(p.value)}`);
  }
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const totalDeals = stages.reduce((n, s) => n + s.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.company ? "Dashboard" : "My performance"}
        description={d.company ? "A live view of leads, pipeline and payments across the workspace. Updates every few seconds." : "Your leads, pipeline and payments. Updates every few seconds."}
        actions={
          <button type="button" className={ui.btn} aria-expanded={editing} onClick={() => { setHidden(d.hidden); setEditing((e) => !e); }}>
            <Icon name={editing ? "x" : "sliders"} className="h-4 w-4" /> {editing ? "Close" : "Customize"}
          </button>
        }
      />

      {editing && (
        <form
          className={`${ui.card} animate-fade-in space-y-4`}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveDashboardPrefs({ hiddenTiles: hidden }), { success: "Dashboard saved.", onSuccess: () => { setEditing(false); mutate(); } });
          }}
        >
          <fieldset>
            <legend className={ui.h2}>Show these tiles</legend>
            <p className={`${ui.muted} mt-0.5`}>Hidden tiles are only hidden for you.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TILES.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 px-3 py-2.5 text-sm font-medium text-stone-800 hover:bg-stone-50 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50/50">
                  <input type="checkbox" className={ui.check} checked={!hidden.includes(t.id)}
                    onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== t.id) : [...h, t.id]))} />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <button type="submit" className={ui.btnPrimary} disabled={pending}>{pending && <Spinner />}{pending ? "Saving…" : "Save"}</button>
            <button type="button" className={ui.btn} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {show("newLeads") && <Tile title="New leads today" icon="leads" tone="emerald" href="/leads?filter=today">{num(d.newLeads)}</Tile>}
        {show("recovery") && <Tile title="Recovery queue" icon="lifebuoy" tone={d.recovery > 0 ? "amber" : "stone"} href="/recovery" note="Leads waiting for a person to step in">{num(d.recovery)}</Tile>}
        {show("escalations") && (
          <Tile title="Escalations in the last 24 hours" icon="arrowUp" tone={d.escalations.escalations > 0 ? "red" : "stone"} href="/leads?filter=escalated24h" note={`Plus ${d.escalations.manual} manual ${d.escalations.manual === 1 ? "reassign" : "reassigns"} (counted separately)`}>
            {num(d.escalations.escalations)}
          </Tile>
        )}
        {show("firstResponse") && <Tile title="Average time to first response" icon="timer" tone="sky" href="/leads" note="Leads acknowledged in the last 7 days">{duration(d.firstResponseSeconds)}</Tile>}
        {show("payments") && <Tile title="Payments received this month" icon="card" tone="emerald" href="/payments?month=current" note="Paid minus refunds">PKR {num(d.payments)}</Tile>}
        {show("atRisk") && (
          <Tile title="Revenue at risk (extra)" icon="alert" tone={d.atRisk.count > 0 ? "amber" : "stone"} href="/recovery" note={`${d.atRisk.count} ${d.atRisk.count === 1 ? "contact" : "contacts"} whose lead is overdue or unassigned`}>
            {d.atRisk.value === null ? "•••••" : `${d.atRisk.currency} ${num(d.atRisk.value)}`}
          </Tile>
        )}
      </div>

      {(show("availability") || show("appointments")) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {show("availability") && (
            <Link href="/leads" className="group rounded-xl border border-stone-200 bg-white p-5 shadow-xs transition-[border-color,box-shadow] hover:border-stone-300 hover:shadow-md">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-stone-600">Employee availability</h2>
                <Icon name="arrowRight" className="h-4 w-4 text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-700" />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => (
                  <div key={k} className="rounded-lg bg-stone-50 px-3 py-2">
                    <dt className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${STATUS_DOT[k]}`} />{STATUS_LABEL[k]}
                    </dt>
                    <dd className="text-xl font-bold tabular-nums text-stone-900">{d.availability.counts[k]}</dd>
                  </div>
                ))}
              </dl>
              {d.availability.people.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="People">
                  {d.availability.people.map((p) => (
                    <li key={p.name} className="flex items-center gap-2 text-sm text-stone-700">
                      <Avatar name={p.name} size="sm" />
                      <span>{p.name} <span className="text-xs text-stone-500">· {STATUS_LABEL[p.status as keyof typeof STATUS_LABEL] ?? p.status}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          )}
          {show("appointments") && (
            <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs" aria-labelledby="appts-h">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="appts-h" className="text-sm font-semibold text-stone-600">Upcoming appointments (next 7 days)</h2>
                  <p className="mt-1 text-[1.7rem] font-bold leading-tight tabular-nums text-stone-900">{num(d.appointments.count)}</p>
                </div>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-50 text-sky-700"><Icon name="calendar" className="h-4 w-4" /></span>
              </div>
              {d.appointments.next.length === 0 ? (
                <p className="mt-3 text-sm text-stone-600">Nothing booked yet. Book from a contact or opportunity page.</p>
              ) : (
                <ul className="mt-3 divide-y divide-stone-100">
                  {d.appointments.next.map((a) => {
                    const dt = new Date(a.startUtc);
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-2.5">
                        <span className="grid w-11 shrink-0 rounded-lg border border-stone-200 text-center leading-tight">
                          <span className="rounded-t-lg bg-stone-50 text-[10px] font-bold uppercase text-stone-500">{dt.toLocaleDateString(undefined, { month: "short" })}</span>
                          <span className="py-0.5 text-sm font-bold tabular-nums text-stone-900">{dt.getDate()}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-stone-900">{a.title}</span>
                          <span className="block text-xs text-stone-600">{dt.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {show("pipeline") && (
        <section className={ui.cardFlush} aria-labelledby="pipe-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200 px-5 py-4">
            <h2 id="pipe-h" className={ui.h2}>Open pipeline value by stage</h2>
            <span className="text-sm text-stone-600"><span className="font-semibold tabular-nums text-stone-900">{totalDeals}</span> open {totalDeals === 1 ? "deal" : "deals"}</span>
          </div>
          {stages.length === 0 ? (
            <p className="px-5 py-6 text-sm text-stone-600">No open opportunities.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {stages.map((s) => (
                <li key={s.id}>
                  <Link href={`/opportunities?stage=${s.id}`} className="group grid gap-2 px-5 py-3 transition-colors hover:bg-stone-50 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-5">
                    <span className="min-w-0 truncate text-sm font-semibold text-stone-900 group-hover:text-emerald-800">{s.name}</span>
                    <span className="flex items-center gap-3">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                        <span className="block h-full rounded-full bg-emerald-600/80" style={{ width: `${Math.max(4, (s.count / maxCount) * 100)}%` }} />
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-stone-600">{s.count} {s.count === 1 ? "deal" : "deals"}</span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-sm font-semibold tabular-nums text-stone-900 sm:justify-end">
                      {s.values.map((v) => <span key={v}>{v}</span>)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

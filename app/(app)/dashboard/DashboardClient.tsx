"use client";
// P2 owns. Dashboard tiles (F5.1–F5.5). Each tile links to the list behind it; refreshes every 3 seconds.
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
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

function Tile({ title, href, children, note }: { title: string; href?: string; children: React.ReactNode; note?: string }) {
  const body = (
    <>
      <h2 className="text-sm font-medium text-stone-700">{title}</h2>
      <div className="mt-1 text-2xl font-semibold text-stone-900">{children}</div>
      {note && <p className="mt-1 text-xs text-stone-600">{note}</p>}
    </>
  );
  return href ? (
    <Link href={href} className={`${ui.card} block hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-700`}>{body}</Link>
  ) : (
    <div className={ui.card}>{body}</div>
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

  if (error && !data) return <p role="alert" className="text-sm text-red-800">Could not load the dashboard. {error.message} This page retries on its own.</p>;
  if (!data) return <p className={ui.muted}>Loading dashboard…</p>;
  const d: DashboardData = data.d;
  const show = (id: string) => !d.hidden.includes(id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className={ui.h1}>{d.company ? "Dashboard" : "My performance"}</h1>
        <button type="button" className={ui.btn} aria-expanded={editing} onClick={() => { setHidden(d.hidden); setEditing((e) => !e); }}>
          {editing ? "Close" : "Customize"}
        </button>
      </div>

      {editing && (
        <form
          className={`${ui.card} space-y-2`}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveDashboardPrefs({ hiddenTiles: hidden }), { success: "Dashboard saved.", onSuccess: () => { setEditing(false); mutate(); } });
          }}
        >
          <fieldset>
            <legend className="font-medium text-stone-900">Show these tiles</legend>
            {TILES.map((t) => (
              <label key={t.id} className="mt-1 flex items-center gap-2 text-sm text-stone-800">
                <input type="checkbox" className="h-4 w-4" checked={!hidden.includes(t.id)}
                  onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== t.id) : [...h, t.id]))} />
                {t.label}
              </label>
            ))}
          </fieldset>
          <button type="submit" className={ui.btnPrimary} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {show("newLeads") && <Tile title="New leads today" href="/leads?filter=today">{num(d.newLeads)}</Tile>}
        {show("recovery") && <Tile title="Recovery queue" href="/recovery" note="Leads waiting for a person to step in">{num(d.recovery)}</Tile>}
        {show("escalations") && (
          <Tile title="Escalations in the last 24 hours" href="/leads?filter=escalated24h" note={`Plus ${d.escalations.manual} manual ${d.escalations.manual === 1 ? "reassign" : "reassigns"} (counted separately)`}>
            {num(d.escalations.escalations)}
          </Tile>
        )}
        {show("firstResponse") && <Tile title="Average time to first response" href="/leads" note="Leads acknowledged in the last 7 days">{duration(d.firstResponseSeconds)}</Tile>}
        {show("payments") && <Tile title="Payments received this month" href="/payments?month=current" note="Paid minus refunds">PKR {num(d.payments)}</Tile>}
        {show("atRisk") && (
          <Tile title="Revenue at risk (extra)" href="/recovery" note={`${d.atRisk.count} ${d.atRisk.count === 1 ? "contact" : "contacts"} whose lead is overdue or unassigned`}>
            {d.atRisk.value === null ? "•••••" : `${d.atRisk.currency} ${num(d.atRisk.value)}`}
          </Tile>
        )}
        {show("availability") && (
          <Tile title="Employee availability" href="/leads">
            <span className="text-base">
              🟢 {d.availability.counts.AVAILABLE} Available · 🟡 {d.availability.counts.BUSY} Busy · 🏖 {d.availability.counts.ON_LEAVE} On leave · ⚫ {d.availability.counts.OFFLINE} Offline
            </span>
            <span className="mt-1 block text-xs font-normal text-stone-600">{d.availability.people.map((p) => p.name).join(", ")}</span>
          </Tile>
        )}
        {show("appointments") && (
          <Tile title="Upcoming appointments (next 7 days)" note={d.appointments.next.map((a) => `${new Date(a.startUtc).toLocaleString()} · ${a.title}`).join("  |  ") || undefined}>
            {num(d.appointments.count)}
          </Tile>
        )}
      </div>

      {show("pipeline") && (
        <section className={ui.card} aria-label="Open pipeline value by stage">
          <h2 className="text-sm font-medium text-stone-700">Open pipeline value by stage</h2>
          {d.pipeline.length === 0 && <p className={`${ui.muted} mt-1`}>No open opportunities.</p>}
          <ul className="mt-2 divide-y divide-stone-200">
            {d.pipeline.map((p) => (
              <li key={`${p.stageId}-${p.currency}`}>
                <Link href={`/opportunities?stage=${p.stageId}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-700">
                  <span className="text-stone-900">{p.stage} <span className="text-stone-600">· {p.count} {p.count === 1 ? "deal" : "deals"}</span></span>
                  <span className="font-medium text-stone-900">{p.value === null ? "•••••" : `${p.currency} ${num(p.value)}`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

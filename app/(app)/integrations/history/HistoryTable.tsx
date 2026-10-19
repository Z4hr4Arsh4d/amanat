"use client";
// P3 owns. Live, filterable, paginated sync history. Table on wide screens, cards on phones (Q7).
import { useEffect, useId, useState } from "react";
import useSWR from "swr";
import { EventStatusChip } from "@/lib/integrations/ui/StatusChip";
import { TimeAgo } from "@/lib/integrations/ui/TimeAgo";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { useRun } from "@/lib/integrations/ui/useRun";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Notice } from "@/components/ui/Kit";
import { ui } from "@/components/ui/styles";
import { retryEventAction } from "../actions";

type Ev = {
  id: string; createdAt: string; provider: string; direction: "IN" | "OUT"; type: string; externalId: string | null;
  status: string; attempts: number; nextAttemptAt: string | null; error: string | null; payload: unknown;
};
type Resp = { items: Ev[]; total: number; page: number; pages: number };
type Filters = { provider: string; direction: string; status: string; q: string };

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Could not load the history. Refresh the page to try again.");
  return j as Resp;
};

const PROVIDERS: [string, string][] = [["", "All providers"], ["WEBCHAT", "Website chat"], ["META", "WhatsApp (Meta)"], ["TWILIO", "Twilio"], ["STRIPE", "Stripe"], ["GOOGLE", "Google"], ["TELEGRAM", "Telegram"]];
const DIRECTIONS: [string, string][] = [["", "In and out"], ["IN", "Incoming (webhooks)"], ["OUT", "Outgoing (calls)"]];
const STATUSES: [string, string][] = [["", "Any result"], ["PROCESSED", "Processed"], ["SENT", "Sent"], ["RETRYING", "Retrying"], ["FAILED", "Failed"], ["REJECTED", "Rejected"], ["RECEIVED", "Received"]];

function Select({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className={`min-w-0 ${ui.field}`}>
      <label htmlFor={id} className={ui.labelSm}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={ui.input}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function Direction({ d }: { d: "IN" | "OUT" }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-stone-600"><Icon name={d === "IN" ? "arrowDown" : "arrowUp"} className="h-3.5 w-3.5" />{d === "IN" ? "In" : "Out"}</span>;
}

export function HistoryTable({ initial }: { initial: Filters }) {
  const [f, setF] = useState<Filters>(initial);
  const [q, setQ] = useState(initial.q);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const searchId = useId();
  const { pending, run } = useRun();

  useEffect(() => {
    const t = setTimeout(() => { setF((x) => ({ ...x, q })); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page: String(page) });
  const { data, error, isLoading, mutate } = useSWR<Resp>(`/integrations/history/data?${qs}`, fetcher, { refreshInterval: 3000, keepPreviousData: true });
  const set = (k: keyof Filters) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };

  const retry = (id: string) => run(id, () => retryEventAction(id), { onOk: () => mutate() });

  return (
    <div className="space-y-3">
      <div className={`${ui.card} grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <Select label="Provider" value={f.provider} options={PROVIDERS} onChange={set("provider")} />
        <Select label="Direction" value={f.direction} options={DIRECTIONS} onChange={set("direction")} />
        <Select label="Result" value={f.status} options={STATUSES} onChange={set("status")} />
        <div className={`min-w-0 ${ui.field}`}>
          <label htmlFor={searchId} className={ui.labelSm}>Search reference, type or error</label>
          <input id={searchId} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="SM…, evt_…, failed" className={ui.input} />
        </div>
      </div>

      <p className="text-sm text-stone-600" aria-live="polite">
        {isLoading && !data ? <span className="inline-flex items-center gap-2"><Spinner /> Loading…</span> : data ? <><span className="font-semibold tabular-nums text-stone-900">{data.total.toLocaleString()}</span> event{data.total === 1 ? "" : "s"}</> : null}
      </p>
      {error && <Notice tone="bad">{(error as Error).message}</Notice>}

      {data && data.items.length === 0 ? (
        <EmptyState icon="history" title="No events match these filters">Try another provider or result, or clear the search.</EmptyState>
      ) : (
      <ul className={`${ui.cardFlush} divide-y divide-stone-100`}>
        {data?.items.map((e) => (
          <li key={e.id} className="px-4 py-3 text-sm sm:px-5">
            <div className="grid grid-cols-1 items-center gap-x-4 gap-y-1 md:grid-cols-[7rem_6.5rem_3.5rem_minmax(0,1fr)_minmax(0,1fr)_7rem]">
              <span className="text-xs text-stone-500"><span className="sr-only">Time: </span><TimeAgo date={e.createdAt} /></span>
              <span className="font-semibold text-stone-900">{e.provider[0] + e.provider.slice(1).toLowerCase()}</span>
              <Direction d={e.direction} />
              <span className="break-all font-mono text-xs">{e.type}</span>
              <span className="break-all font-mono text-xs text-stone-700"><span className="sr-only">Reference: </span>{e.externalId ?? "—"}</span>
              <span><EventStatusChip status={e.status} /></span>
            </div>
            {e.error && <p className="mt-1.5 break-words rounded-md bg-red-50 px-2.5 py-1.5 text-red-900">{e.error}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-stone-600">
              <span>Tries: <span className="font-semibold tabular-nums">{e.attempts}</span></span>
              {e.status === "RETRYING" && e.nextAttemptAt && <span>Next try <TimeAgo date={e.nextAttemptAt} prefix="" /></span>}
              <button type="button" className="inline-flex items-center gap-1 rounded font-semibold text-emerald-800 hover:underline" aria-expanded={open === e.id}
                onClick={() => setOpen(open === e.id ? null : e.id)}>
                {open === e.id ? "Hide details" : "Show details"}<Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${open === e.id ? "rotate-180" : ""}`} />
              </button>
              {e.direction === "OUT" && e.status === "FAILED" && (
                <button type="button" disabled={!!pending} onClick={() => retry(e.id)} className={`${ui.btnSm} !h-7`}>
                  {pending === e.id ? <Spinner /> : <Icon name="refresh" className="h-3.5 w-3.5" />}Retry
                </button>
              )}
            </div>
            {open === e.id && (
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-stone-200 bg-stone-50 p-3 font-mono text-xs text-stone-800">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ul>
      )}

      {data && data.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={ui.btnSm}><Icon name="chevronLeft" className="h-3.5 w-3.5" />Newer</button>
          <span className="tabular-nums text-stone-600">Page {data.page} of {data.pages}</span>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)} className={ui.btnSm}>Older<Icon name="chevronRight" className="h-3.5 w-3.5" /></button>
        </nav>
      )}
    </div>
  );
}

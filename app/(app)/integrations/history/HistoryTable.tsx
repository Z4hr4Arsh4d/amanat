"use client";
// P3 owns. Live, filterable, paginated sync history. Table on wide screens, cards on phones (Q7).
import { useEffect, useId, useState } from "react";
import useSWR from "swr";
import { EventStatusChip } from "@/lib/integrations/ui/StatusChip";
import { TimeAgo } from "@/lib/integrations/ui/TimeAgo";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { useRun } from "@/lib/integrations/ui/useRun";
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
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-stone-700">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function Direction({ d }: { d: "IN" | "OUT" }) {
  return <span className="whitespace-nowrap text-xs">{d === "IN" ? "↓ In" : "↑ Out"}</span>;
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
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-stone-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select label="Provider" value={f.provider} options={PROVIDERS} onChange={set("provider")} />
        <Select label="Direction" value={f.direction} options={DIRECTIONS} onChange={set("direction")} />
        <Select label="Result" value={f.status} options={STATUSES} onChange={set("status")} />
        <div className="min-w-0 space-y-1">
          <label htmlFor={searchId} className="block text-xs font-medium text-stone-700">Search reference, type or error</label>
          <input id={searchId} value={q} onChange={(e) => setQ(e.target.value)} placeholder="SM…, evt_…, failed"
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700" />
        </div>
      </div>

      <p className="text-sm text-stone-600" aria-live="polite">
        {isLoading && !data ? <><Spinner /> Loading…</> : data ? `${data.total.toLocaleString()} event${data.total === 1 ? "" : "s"}` : null}
      </p>
      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"><span aria-hidden="true">⚠ </span>{(error as Error).message}</p>}

      <ul className="space-y-2">
        {data?.items.map((e) => (
          <li key={e.id} className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-[9rem_6rem_4rem_minmax(0,1fr)_minmax(0,1fr)_7rem]">
              <span className="text-stone-700"><span className="sr-only">Time: </span><TimeAgo date={e.createdAt} /></span>
              <span className="font-medium">{e.provider[0] + e.provider.slice(1).toLowerCase()}</span>
              <Direction d={e.direction} />
              <span className="break-all font-mono text-xs">{e.type}</span>
              <span className="break-all font-mono text-xs text-stone-700"><span className="sr-only">Reference: </span>{e.externalId ?? "—"}</span>
              <span><EventStatusChip status={e.status} /></span>
            </div>
            {e.error && <p className="mt-1 break-words text-red-900">{e.error}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-600">
              <span>Tries: {e.attempts}</span>
              {e.status === "RETRYING" && e.nextAttemptAt && <span>Next try <TimeAgo date={e.nextAttemptAt} prefix="" /></span>}
              <button type="button" className="underline focus:outline-none focus:ring-2 focus:ring-emerald-700" aria-expanded={open === e.id}
                onClick={() => setOpen(open === e.id ? null : e.id)}>
                {open === e.id ? "Hide details" : "Show details"}
              </button>
              {e.direction === "OUT" && e.status === "FAILED" && (
                <button type="button" disabled={!!pending} onClick={() => retry(e.id)}
                  className="inline-flex items-center gap-1 rounded border border-stone-300 px-2 py-0.5 font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-700">
                  {pending === e.id && <Spinner />}Retry
                </button>
              )}
            </div>
            {open === e.id && (
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-stone-50 p-2 text-xs">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            )}
          </li>
        ))}
        {data && data.items.length === 0 && <li className="rounded border border-dashed border-stone-300 p-6 text-center text-sm text-stone-600">No events match these filters.</li>}
      </ul>

      {data && data.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-stone-300 bg-white px-3 py-1.5 disabled:opacity-50">← Newer</button>
          <span>Page {data.page} of {data.pages}</span>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded border border-stone-300 bg-white px-3 py-1.5 disabled:opacity-50">Older →</button>
        </nav>
      )}
    </div>
  );
}

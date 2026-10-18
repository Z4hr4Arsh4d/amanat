"use client";
// P3 owns. Payment list, request form and summary, shared by /payments and the contact/opportunity slots.
// Live via SWR (3s): a payment turns PAID on screen as soon as Stripe's webhook arrives (I2.2).
import { useId, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { createPaymentAction, expirePaymentAction, sendPaymentLinkAction } from "@/app/(app)/payments/actions";
import { Chip, type Tone } from "./StatusChip";
import { Spinner } from "./Spinner";
import { TimeAgo } from "./TimeAgo";
import { useRun } from "./useRun";

export type PaymentRow = {
  id: string; amount: number; currency: string; status: string; refundedAmount: number;
  contact: { id: string; name: string }; opportunity: { id: string; title: string }; requestedBy: string;
  stripeSessionId: string; stripePaymentIntentId: string | null; url: string; paidAt: string | null; createdAt: string;
};
export type PaymentList = {
  items: PaymentRow[]; total: number; page: number; pages: number; canRequest: boolean;
  summary: { currency: string; collectedThisMonth: number; projected: number; mine: boolean };
};

export const fetchJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Could not load. Refresh the page to try again.");
  return j as T;
};

export function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

const STATUS: Record<string, { tone: Tone; label: string; tip: string }> = {
  PENDING: { tone: "warn", label: "Waiting for payment", tip: "The link is open and has not been paid yet." },
  ABANDONED: { tone: "warn", label: "Abandoned", tip: "Customer opened the link but did not pay. If they pay later, it still turns Paid." },
  PAID: { tone: "ok", label: "Paid", tip: "Confirmed by Stripe's webhook." },
  FAILED: { tone: "bad", label: "Failed", tip: "The payment attempt failed (for example the card was declined)." },
  EXPIRED: { tone: "off", label: "Expired", tip: "The link expired before it was paid." },
  REFUNDED: { tone: "info", label: "Refunded", tip: "Fully refunded in Stripe." },
  PARTIALLY_REFUNDED: { tone: "info", label: "Partly refunded", tip: "Part of the amount was refunded in Stripe." },
};
export function PaymentStatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? { tone: "off" as Tone, label: status, tip: "" };
  return <Chip tone={s.tone} title={s.tip}>{s.label}</Chip>;
}

const btn = "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-60";

function Row({ p, canRequest, onChanged, compact }: { p: PaymentRow; canRequest: boolean; onChanged: () => void; compact?: boolean }) {
  const { pending, run } = useRun();
  const open = p.status === "PENDING" || p.status === "ABANDONED";
  const ref = p.stripePaymentIntentId ?? p.stripeSessionId;
  return (
    <li className="space-y-2 rounded-lg border border-stone-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{money(p.amount, p.currency)}
            {p.refundedAmount > 0 && <span className="ml-2 text-xs font-normal text-stone-700">({money(p.refundedAmount, p.currency)} refunded)</span>}
          </p>
          {!compact && (
            <p className="text-stone-700">
              <a href={`/opportunities/${p.opportunity.id}`} className="hover:underline">{p.opportunity.title}</a> ·{" "}
              <a href={`/contacts/${p.contact.id}`} className="hover:underline">{p.contact.name}</a>
            </p>
          )}
        </div>
        <PaymentStatusChip status={p.status} />
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-stone-700 sm:grid-cols-2">
        <div><dt className="inline">Requested by: </dt><dd className="inline">{p.requestedBy}, <TimeAgo date={p.createdAt} /></dd></div>
        {p.paidAt && <div><dt className="inline">Paid: </dt><dd className="inline"><TimeAgo date={p.paidAt} /></dd></div>}
        <div className="sm:col-span-2">
          <dt className="inline">Stripe reference: </dt>
          <dd className="inline break-all font-mono">
            {p.stripePaymentIntentId && !/_sim|_seed/.test(p.stripePaymentIntentId)
              ? <a className="underline" target="_blank" rel="noreferrer" href={`https://dashboard.stripe.com/test/payments/${p.stripePaymentIntentId}`}>{ref}</a>
              : ref}
          </dd>
        </div>
      </dl>
      {canRequest && open && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${btn} border-stone-300 bg-white hover:bg-stone-100`}
            onClick={() => navigator.clipboard.writeText(p.url).then(() => toast.success("Payment link copied."), () => toast.error("Could not copy. Open the link and copy it from the address bar."))}>
            Copy link
          </button>
          <button type="button" disabled={!!pending} className={`${btn} border-emerald-600 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`}
            onClick={() => run("wa", () => sendPaymentLinkAction(p.id), { onOk: onChanged })}>
            {pending === "wa" && <Spinner />}Send on WhatsApp
          </button>
          <button type="button" disabled={!!pending} className={`${btn} border-red-300 bg-white text-red-800 hover:bg-red-50`}
            onClick={() => { if (confirm("Expire this payment link? The customer will no longer be able to pay with it.")) run("exp", () => expirePaymentAction(p.id), { onOk: onChanged }); }}>
            {pending === "exp" && <Spinner />}Expire link
          </button>
        </div>
      )}
    </li>
  );
}

export function PaymentListView({ query, compact, emptyText, onData }: { query: Record<string, string>; compact?: boolean; emptyText?: string; onData?: (d: PaymentList) => void }) {
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ ...query, page: String(page) });
  const { data, error, mutate } = useSWR<PaymentList>(`/payments/data?${qs}`, fetchJson, { refreshInterval: 3000, keepPreviousData: true, ...(onData ? { onSuccess: onData } : {}) });
  if (error) return <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"><span aria-hidden="true">⚠ </span>{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-stone-600"><Spinner /> Loading payments…</p>;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {data.items.map((p) => <Row key={p.id} p={p} canRequest={data.canRequest} onChanged={() => mutate()} compact={compact} />)}
        {data.items.length === 0 && <li className="rounded border border-dashed border-stone-300 p-4 text-center text-sm text-stone-600">{emptyText ?? "No payments yet."}</li>}
      </ul>
      {data.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-stone-300 bg-white px-3 py-1.5 disabled:opacity-50">← Newer</button>
          <span>Page {data.page} of {data.pages}</span>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded border border-stone-300 bg-white px-3 py-1.5 disabled:opacity-50">Older →</button>
        </nav>
      )}
    </div>
  );
}

type Opp = { id: string; title: string; contact: string; currency: string; value: number | null };

/** I2.1 request form. With opportunityId it is fixed (opportunity page); without, the user picks one. */
export function PaymentRequestForm({ opportunityId, onCreated }: { opportunityId?: string; onCreated?: () => void }) {
  const ids = { opp: useId(), amount: useId(), currency: useId(), search: useId() };
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState(opportunityId ?? "");
  const [amount, setAmount] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const { pending, run } = useRun();
  const { data, error } = useSWR<{ items: Opp[] }>(`/payments/data/opportunities?${new URLSearchParams(opportunityId ? { id: opportunityId } : q ? { q } : {})}`, fetchJson);
  const opp = data?.items.find((o) => o.id === chosen);
  const shownAmount = amount ?? (opp?.value != null ? String(opp.value) : "");
  const shownCurrency = currency ?? (opp?.currency === "USD" ? "USD" : "PKR");

  if (error && /permission/i.test((error as Error).message)) return <p className="text-sm text-stone-600">Creating payment links needs the “Create payment requests” permission. Ask an admin if you need it.</p>;
  if (error) return <p role="alert" className="text-sm text-red-900"><span aria-hidden="true">⚠ </span>{(error as Error).message}</p>;
  if (opportunityId && data && !opp) return <p className="text-sm text-stone-600">Payment requests are not available for this opportunity (it is lost, deleted, or not yours).</p>;
  return (
    <form className="space-y-3 rounded-lg border border-stone-200 bg-white p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run("create", () => createPaymentAction({ opportunityId: chosen, amount: shownAmount, currency: shownCurrency }));
        if (r.ok && r.data) { setCreated(r.data); setAmount(null); onCreated?.(); }
      }}>
      {!opportunityId && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={ids.search} className="block text-sm font-medium">Find opportunity</label>
            <input id={ids.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or customer name"
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700" />
          </div>
          <div className="space-y-1">
            <label htmlFor={ids.opp} className="block text-sm font-medium">Opportunity</label>
            <select id={ids.opp} value={chosen} onChange={(e) => { setChosen(e.target.value); setAmount(null); setCurrency(null); }}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700">
              <option value="">{data ? (data.items.length ? "Choose…" : "No opportunities found") : "Loading…"}</option>
              {data?.items.map((o) => <option key={o.id} value={o.id}>{o.title} — {o.contact}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
        <div className="space-y-1">
          <label htmlFor={ids.amount} className="block text-sm font-medium">Amount</label>
          <input id={ids.amount} inputMode="decimal" value={shownAmount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50000"
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700" />
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.currency} className="block text-sm font-medium">Currency</label>
          <select id={ids.currency} value={shownCurrency} onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700">
            <option value="PKR">PKR</option><option value="USD">USD</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-stone-600">The customer pays on Stripe&apos;s secure page. The link works for 30 minutes. Test card: 4242 4242 4242 4242.</p>
      <button type="submit" disabled={!!pending || !chosen}
        className="inline-flex items-center gap-2 rounded bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-60">
        {pending && <Spinner />}{pending ? "Creating link…" : "Create payment link"}
      </button>
      {created && (
        <p role="status" className="break-all rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
          <span aria-hidden="true">✓ </span>Link ready: <a href={created.url} target="_blank" rel="noreferrer" className="underline">{created.url}</a>. Use “Copy link” or “Send on WhatsApp” below.
        </p>
      )}
    </form>
  );
}

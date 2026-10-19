"use client";
// P3 owns. Payment list, request form and summary, shared by /payments and the contact/opportunity slots.
// Live via SWR (3s): a payment turns PAID on screen as soon as Stripe's webhook arrives (I2.2).
import { useId, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { createPaymentAction, expirePaymentAction, sendPaymentLinkAction } from "@/app/(app)/payments/actions";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Notice } from "@/components/ui/Kit";
import { ui } from "@/components/ui/styles";
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

function Row({ p, canRequest, onChanged, compact }: { p: PaymentRow; canRequest: boolean; onChanged: () => void; compact?: boolean }) {
  const { pending, run } = useRun();
  const open = p.status === "PENDING" || p.status === "ABANDONED";
  const ref = p.stripePaymentIntentId ?? p.stripeSessionId;
  return (
    <li className="space-y-2.5 py-4 text-sm first:pt-1 last:pb-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold tabular-nums text-stone-900">{money(p.amount, p.currency)}
            {p.refundedAmount > 0 && <span className="ml-2 text-xs font-medium text-stone-600">({money(p.refundedAmount, p.currency)} refunded)</span>}
          </p>
          {!compact && (
            <p className="mt-0.5 text-stone-600">
              <a href={`/opportunities/${p.opportunity.id}`} className="font-semibold text-stone-800 hover:text-emerald-800 hover:underline">{p.opportunity.title}</a>
              <span aria-hidden="true"> · </span>
              <a href={`/contacts/${p.contact.id}`} className="hover:text-emerald-800 hover:underline">{p.contact.name}</a>
            </p>
          )}
        </div>
        <PaymentStatusChip status={p.status} />
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-stone-600 sm:grid-cols-2">
        <div><dt className="inline">Requested by </dt><dd className="inline font-medium text-stone-800">{p.requestedBy}, <TimeAgo date={p.createdAt} /></dd></div>
        {p.paidAt && <div><dt className="inline">Paid </dt><dd className="inline font-medium text-stone-800"><TimeAgo date={p.paidAt} /></dd></div>}
        <div className="sm:col-span-2">
          <dt className="inline">Stripe reference: </dt>
          <dd className="inline break-all font-mono text-[11px]">
            {p.stripePaymentIntentId && !/_sim|_seed/.test(p.stripePaymentIntentId)
              ? <a className="underline hover:text-emerald-800" target="_blank" rel="noreferrer" href={`https://dashboard.stripe.com/test/payments/${p.stripePaymentIntentId}`}>{ref}</a>
              : ref}
          </dd>
        </div>
      </dl>
      {canRequest && open && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <button type="button" className={ui.btnSm}
            onClick={() => navigator.clipboard.writeText(p.url).then(() => toast.success("Payment link copied."), () => toast.error("Could not copy. Open the link and copy it from the address bar."))}>
            <Icon name="copy" className="h-3.5 w-3.5" />Copy link
          </button>
          <button type="button" disabled={!!pending} className={`${ui.btnSm} !border-emerald-300 !bg-emerald-50 !text-emerald-900 hover:!bg-emerald-100`}
            onClick={() => run("wa", () => sendPaymentLinkAction(p.id), { onOk: onChanged })}>
            {pending === "wa" ? <Spinner /> : <Icon name="send" className="h-3.5 w-3.5" />}Send on WhatsApp
          </button>
          <button type="button" disabled={!!pending} className={ui.btnDangerSm}
            onClick={() => { if (confirm("Expire this payment link? The customer will no longer be able to pay with it.")) run("exp", () => expirePaymentAction(p.id), { onOk: onChanged }); }}>
            {pending === "exp" ? <Spinner /> : <Icon name="ban" className="h-3.5 w-3.5" />}Expire link
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
  if (error) return <Notice tone="bad">{(error as Error).message}</Notice>;
  if (!data) return <p className="flex items-center gap-2 text-sm text-stone-600"><Spinner /> Loading payments…</p>;
  if (data.items.length === 0) return <EmptyState compact icon="card" title={emptyText ?? "No payments yet."} />;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-stone-100">
        {data.items.map((p) => <Row key={p.id} p={p} canRequest={data.canRequest} onChanged={() => mutate()} compact={compact} />)}
      </ul>
      {data.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 border-t border-stone-100 pt-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={ui.btnSm}><Icon name="chevronLeft" className="h-3.5 w-3.5" />Newer</button>
          <span className="tabular-nums text-stone-600">Page {data.page} of {data.pages}</span>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)} className={ui.btnSm}>Older<Icon name="chevronRight" className="h-3.5 w-3.5" /></button>
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

  if (error && /permission/i.test((error as Error).message)) return <p className={ui.muted}>Creating payment links needs the “Create payment requests” permission. Ask an admin if you need it.</p>;
  if (error) return <Notice tone="bad">{(error as Error).message}</Notice>;
  if (opportunityId && data && !opp) return <p className="text-sm text-stone-600">Payment requests are not available for this opportunity (it is lost, deleted, or not yours).</p>;
  return (
    <form className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run("create", () => createPaymentAction({ opportunityId: chosen, amount: shownAmount, currency: shownCurrency }));
        if (r.ok && r.data) { setCreated(r.data); setAmount(null); onCreated?.(); }
      }}>
      {!opportunityId && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={ui.field}>
            <label htmlFor={ids.search} className={ui.label}>Find opportunity</label>
            <input id={ids.search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or customer name" className={ui.input} />
          </div>
          <div className={ui.field}>
            <label htmlFor={ids.opp} className={ui.label}>Opportunity</label>
            <select id={ids.opp} value={chosen} onChange={(e) => { setChosen(e.target.value); setAmount(null); setCurrency(null); }} className={ui.input}>
              <option value="">{data ? (data.items.length ? "Choose…" : "No opportunities found") : "Loading…"}</option>
              {data?.items.map((o) => <option key={o.id} value={o.id}>{o.title} — {o.contact}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <div className={ui.field}>
          <label htmlFor={ids.amount} className={ui.label}>Amount</label>
          <input id={ids.amount} inputMode="decimal" value={shownAmount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50000" className={`${ui.input} tabular-nums`} />
        </div>
        <div className={ui.field}>
          <label htmlFor={ids.currency} className={ui.label}>Currency</label>
          <select id={ids.currency} value={shownCurrency} onChange={(e) => setCurrency(e.target.value)} className={ui.input}>
            <option value="PKR">PKR</option><option value="USD">USD</option>
          </select>
        </div>
      </div>
      <p className={ui.hint}>The customer pays on Stripe&apos;s secure page. The link works for 30 minutes. Test card: 4242 4242 4242 4242.</p>
      <button type="submit" disabled={!!pending || !chosen} className={ui.btnPrimary}>
        {pending ? <Spinner /> : <Icon name="card" className="h-4 w-4" />}{pending ? "Creating link…" : "Create payment link"}
      </button>
      {created && (
        <Notice tone="ok" role="status" title="Payment link ready">
          <a href={created.url} target="_blank" rel="noreferrer" className="break-all underline">{created.url}</a>
          <span className="block">Use “Copy link” or “Send on WhatsApp” in the payments list.</span>
        </Notice>
      )}
    </form>
  );
}

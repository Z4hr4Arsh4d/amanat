"use client";
// P3 owns.
import { useId, useState } from "react";
import { PaymentListView, PaymentRequestForm, money, type PaymentList } from "@/lib/integrations/ui/Payments";
import { Icon } from "@/components/ui/Icon";
import { ui } from "@/components/ui/styles";

const STATUSES: [string, string][] = [
  ["", "Any status"], ["PENDING", "Waiting for payment"], ["PAID", "Paid"], ["ABANDONED", "Abandoned"], ["FAILED", "Failed"],
  ["EXPIRED", "Expired"], ["REFUNDED", "Refunded"], ["PARTIALLY_REFUNDED", "Partly refunded"],
];

export function PaymentsClient({ initial, canRequest }: { initial: { month: string; status: string }; canRequest: boolean }) {
  const [month, setMonth] = useState(initial.month);
  const [status, setStatus] = useState(initial.status);
  const [summary, setSummary] = useState<PaymentList["summary"] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const ids = { status: useId(), month: useId() };
  const query = { ...(month ? { month } : {}), ...(status ? { status } : {}) };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold text-stone-600">{summary?.mine ? "Collected this month (your payments)" : "Collected this month"}</h2>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon name="checkCircle" className="h-4 w-4" /></span>
          </div>
          <p className="mt-2 text-[1.7rem] font-bold tabular-nums tracking-tight text-stone-900">{summary ? money(summary.collectedThisMonth, summary.currency) : "…"}</p>
          <p className="mt-1 text-xs text-stone-600">Payments confirmed by Stripe minus refunds ({summary?.currency ?? "PKR"} only).</p>
        </section>
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold text-stone-600">Projected (not collected yet)</h2>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-700"><Icon name="clock" className="h-4 w-4" /></span>
          </div>
          <p className="mt-2 text-[1.7rem] font-bold tabular-nums tracking-tight text-stone-900">{summary ? money(summary.projected, summary.currency) : "…"}</p>
          <p className="mt-1 text-xs text-stone-600">Open opportunity values plus unpaid payment links. Not counted as revenue.</p>
        </section>
      </div>

      {canRequest && (
        <div className={ui.cardFlush}>
          <button type="button" onClick={() => setShowForm(!showForm)} aria-expanded={showForm}
            className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-semibold text-stone-900 transition-colors hover:bg-stone-50">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-800 text-white"><Icon name="plus" className="h-4 w-4" strokeWidth={2.4} /></span>
            <span className="flex-1">Request a payment</span>
            <Icon name="chevronDown" className={`h-4 w-4 text-stone-500 transition-transform ${showForm ? "rotate-180" : ""}`} />
          </button>
          {showForm && <div className="border-t border-stone-200 p-5"><PaymentRequestForm /></div>}
        </div>
      )}

      <section className={ui.cardFlush} aria-labelledby="pay-all">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="pay-all" className={ui.h2}>All payments</h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor={ids.status} className="text-xs font-semibold text-stone-600">Status</label>
              <select id={ids.status} value={status} onChange={(e) => setStatus(e.target.value)} className={ui.inputSm}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <label htmlFor={ids.month} className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <input id={ids.month} type="checkbox" checked={month === "current"} onChange={(e) => setMonth(e.target.checked ? "current" : "")} className={ui.check} />
              Only payments received this month
            </label>
          </div>
        </div>
        <div className="px-5 py-4">
          <PaymentListView query={query} onData={(d) => setSummary(d.summary)} emptyText="No payments match. Create one with “Request a payment”." />
        </div>
      </section>
    </div>
  );
}

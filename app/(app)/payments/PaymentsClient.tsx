"use client";
// P3 owns.
import { useId, useState } from "react";
import { PaymentListView, PaymentRequestForm, money, type PaymentList } from "@/lib/integrations/ui/Payments";

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
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="text-sm font-medium text-emerald-900">{summary?.mine ? "Collected this month (your payments)" : "Collected this month"}</h2>
          <p className="text-2xl font-semibold text-emerald-950">{summary ? money(summary.collectedThisMonth, summary.currency) : "…"}</p>
          <p className="text-xs text-emerald-900">Payments confirmed by Stripe minus refunds ({summary?.currency ?? "PKR"} only).</p>
        </section>
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-medium text-amber-900">Projected (not collected yet)</h2>
          <p className="text-2xl font-semibold text-amber-950">{summary ? money(summary.projected, summary.currency) : "…"}</p>
          <p className="text-xs text-amber-900">Open opportunity values plus unpaid payment links. Not counted as revenue.</p>
        </section>
      </div>

      {canRequest && (
        <div>
          <button type="button" onClick={() => setShowForm(!showForm)} aria-expanded={showForm}
            className="rounded bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700">
            {showForm ? "Close" : "Request a payment"}
          </button>
          {showForm && <div className="mt-2"><PaymentRequestForm /></div>}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor={ids.status} className="block text-xs font-medium text-stone-700">Status</label>
          <select id={ids.status} value={status} onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700">
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <label htmlFor={ids.month} className="flex items-center gap-2 text-sm">
          <input id={ids.month} type="checkbox" checked={month === "current"} onChange={(e) => setMonth(e.target.checked ? "current" : "")} className="h-4 w-4" />
          Only payments received this month
        </label>
      </div>

      <PaymentListView query={query} onData={(d) => setSummary(d.summary)} emptyText="No payments match. Create one with “Request a payment”." />
    </div>
  );
}

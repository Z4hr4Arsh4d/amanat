"use client";
// P2 owns. Runs a saved list's filter fresh every 3 seconds, 25 per page (F2.6, Q9).
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Notice, PageHeader } from "@/components/ui/Kit";
import { runSavedList } from "../actions";

export function ListRunner({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const { data, error } = useSWR(["saved-list", id, page], async () => {
    const r = await runSavedList({ id, page });
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }, { refreshInterval: 3000, keepPreviousData: true });

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Notice tone="bad" title="Could not open this list.">{error.message}</Notice>
        <Link href="/lists" className={ui.link}>Back to saved lists</Link>
      </div>
    );
  }
  if (!data) return <p className={ui.muted} role="status">Loading list…</p>;

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: "/lists", label: "Saved lists" }} title={data.name}
        description={<span role="status"><span className="font-semibold tabular-nums text-stone-900">{data.total}</span> {data.total === 1 ? "match" : "matches"} right now. Updates on its own.</span>} />
      {data.rows.length === 0 && <EmptyState icon="filter" title="Nothing matches this list at the moment" />}

      {data.rows.length > 0 && (
        <div className={ui.cardFlush}>
          {/* Cards on small screens, table from sm up (no sideways scroll at 375px). */}
          <ul className="divide-y divide-stone-100 sm:hidden">
            {data.rows.map((r) => (
              <li key={r.id}>
                <Link href={r.href} className="flex items-start gap-3 px-4 py-3.5 hover:bg-stone-50">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-stone-900">{r.cells[0]}</span>
                    {r.cells.slice(1).map((c, i) => <span key={i} className="block text-stone-600"><span className="text-stone-500">{data.columns[i + 1]}:</span> {c}</span>)}
                  </span>
                  <Icon name="chevronRight" className="mt-1 h-4 w-4 text-stone-400" />
                </Link>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-left text-sm sm:table">
            <thead className="border-b border-stone-200 bg-stone-50/70">
              <tr>{data.columns.map((c) => <th key={c} scope="col" className={ui.th}>{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.rows.map((r) => (
                <tr key={r.id} className={ui.row}>
                  {r.cells.map((c, i) => (
                    <td key={i} className="px-4 py-3 text-stone-700">{i === 0 ? <Link href={r.href} className="font-semibold text-stone-900 hover:text-emerald-800 hover:underline">{c}</Link> : c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pages">
          <button type="button" className={ui.btnSm} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><Icon name="chevronLeft" className="h-3.5 w-3.5" />Previous</button>
          <span className="text-sm tabular-nums text-stone-600">Page {data.page} of {data.pages}</span>
          <button type="button" className={ui.btnSm} disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next<Icon name="chevronRight" className="h-3.5 w-3.5" /></button>
        </nav>
      )}
    </div>
  );
}

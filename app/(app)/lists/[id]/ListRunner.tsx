"use client";
// P2 owns. Runs a saved list's filter fresh every 3 seconds, 25 per page (F2.6, Q9).
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ui } from "@/components/ui/styles";
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
      <div className="space-y-2">
        <p role="alert" className="text-sm text-red-800">Could not open this list. {error.message}</p>
        <Link href="/lists" className="underline">Back to saved lists</Link>
      </div>
    );
  }
  if (!data) return <p className={ui.muted}>Loading list…</p>;

  return (
    <div className="space-y-4">
      <p><Link href="/lists" className="text-sm underline">← Saved lists</Link></p>
      <h1 className={ui.h1}>{data.name}</h1>
      <p className={ui.muted} role="status">{data.total} {data.total === 1 ? "match" : "matches"} right now. Updates on its own.</p>
      {data.rows.length === 0 && <p className="text-sm text-stone-800">Nothing matches this list at the moment.</p>}

      {/* Cards on small screens, table from sm up (no sideways scroll at 375px). */}
      <ul className="space-y-3 sm:hidden">
        {data.rows.map((r) => (
          <li key={r.id} className={ui.card}>
            <Link href={r.href} className="font-medium text-emerald-900 underline">{r.cells[0]}</Link>
            {r.cells.slice(1).map((c, i) => <p key={i} className={ui.muted}>{data.columns[i + 1]}: {c}</p>)}
          </li>
        ))}
      </ul>
      {data.rows.length > 0 && (
        <table className="hidden w-full text-left text-sm sm:table">
          <thead>
            <tr className="border-b border-stone-300">{data.columns.map((c) => <th key={c} scope="col" className="py-2 pr-4 font-medium text-stone-800">{c}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-b border-stone-200">
                {r.cells.map((c, i) => (
                  <td key={i} className="py-2 pr-4 text-stone-900">{i === 0 ? <Link href={r.href} className="text-emerald-900 underline">{c}</Link> : c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <nav className="flex items-center gap-3" aria-label="Pages">
        <button type="button" className={ui.btn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span className="text-sm text-stone-800">Page {data.page} of {data.pages}</span>
        <button type="button" className={ui.btn} disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </nav>
    </div>
  );
}

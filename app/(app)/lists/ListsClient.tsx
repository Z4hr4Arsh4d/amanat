"use client";
// P2 owns. Saved lists index (F2.6).
import Link from "next/link";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { deleteSavedList, listSavedLists } from "./actions";

const ENTITY = { contact: "Contacts", opportunity: "Opportunities", lead: "Leads" } as const;

export function ListsClient() {
  const { data, error, mutate } = useSWR("saved-lists", async () => {
    const r = await listSavedLists();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }, { refreshInterval: 3000 });
  const { pending, run } = useAction();

  return (
    <div className="space-y-4">
      <h1 className={ui.h1}>Saved lists</h1>
      <p className={ui.muted}>A saved list keeps its filter, not a copy of the results. It runs again every time you open it, so it is always up to date.</p>
      {error && <p role="alert" className="text-sm text-red-800">Could not load your lists. {error.message}</p>}
      {!data && !error && <p className={ui.muted}>Loading…</p>}
      {data && data.length === 0 && <p className={ui.muted}>No saved lists yet. Add filters on the Contacts or Opportunities page and press &ldquo;Save as list&rdquo;.</p>}
      <ul className="space-y-3">
        {data?.map((l) => (
          <li key={l.id} className={`${ui.card} flex flex-wrap items-center justify-between gap-2`}>
            <div>
              <Link href={`/lists/${l.id}`} className="font-medium text-emerald-900 underline">{l.name}</Link>
              <p className={ui.muted}>{ENTITY[l.entity]} · {l.criteria} {l.criteria === 1 ? "criterion" : "criteria"}{l.shared ? " · shared" : ""}</p>
            </div>
            {l.mine && (
              <button type="button" className={ui.btnDanger} disabled={pending} aria-label={`Delete list ${l.name}`}
                onClick={() => { if (window.confirm(`Delete the list "${l.name}"? This only removes the list, not any records.`)) run(() => deleteSavedList({ id: l.id }), { success: "List deleted.", onSuccess: () => mutate() }); }}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

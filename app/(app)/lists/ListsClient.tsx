"use client";
// P2 owns. Saved lists index (F2.6).
import Link from "next/link";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui/Kit";
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
    <div className="space-y-6">
      <PageHeader title="Saved lists" description="A saved list keeps its filter, not a copy of the results. It runs again every time you open it, so it is always up to date." />
      {error && <Notice tone="bad">Could not load your lists. {error.message}</Notice>}
      {!data && !error && <p className={ui.muted} role="status">Loading…</p>}
      {data && data.length === 0 && (
        <EmptyState icon="bookmark" title="No saved lists yet" action={<Link href="/contacts" className={ui.btn}>Go to contacts</Link>}>
          Add filters on the Contacts or Opportunities page and press &ldquo;Save as list&rdquo;.
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((l) => (
            <li key={l.id} className="group relative flex flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-xs transition-[border-color,box-shadow] hover:border-stone-300 hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon name={l.entity === "opportunity" ? "target" : l.entity === "lead" ? "leads" : "users"} className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <Link href={`/lists/${l.id}`} className="block break-words font-bold text-stone-900 after:absolute after:inset-0 after:rounded-xl group-hover:text-emerald-800">{l.name}</Link>
                  <p className="mt-0.5 text-sm text-stone-600">{ENTITY[l.entity]} · {l.criteria} {l.criteria === 1 ? "criterion" : "criteria"}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                {l.shared ? <Badge icon="users">Shared</Badge> : <span className="text-xs text-stone-500">Only you</span>}
                {l.mine && (
                  <button type="button" className={`${ui.btnDangerSm} relative z-10`} disabled={pending} aria-label={`Delete list ${l.name}`}
                    onClick={() => { if (window.confirm(`Delete the list "${l.name}"? This only removes the list, not any records.`)) run(() => deleteSavedList({ id: l.id }), { success: "List deleted.", onSuccess: () => mutate() }); }}>
                    <Icon name="trash" className="h-3.5 w-3.5" />Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

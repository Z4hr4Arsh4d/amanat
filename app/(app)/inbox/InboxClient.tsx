"use client";
// P3 owns. Conversation list + thread, live via SWR (3s). On phones you see one at a time.
import { useEffect, useId, useState } from "react";
import useSWR from "swr";
import { Chip } from "@/lib/integrations/ui/StatusChip";
import { TimeAgo } from "@/lib/integrations/ui/TimeAgo";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { ThreadView, type ThreadData } from "@/lib/integrations/ui/Thread";

type Item = {
  id: string;
  kind: "WHATSAPP" | "WEBCHAT";
  contact: { id: string; name: string; phone: string | null; optedOut: boolean };
  assignee: { id: string | null; name: string | null; why: string };
  last: { body: string; direction: "IN" | "OUT"; status: string; at: string } | null;
  unread: number;
  lastMessageAt: string;
};
type List = { items: Item[]; total: number; page: number; pages: number };

export const fetcher = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 404 ? "This conversation does not exist or you are not allowed to see it." : j.error ?? "Could not load. Refresh to try again.");
  return j as T;
};

export function InboxClient({ initialId }: { initialId: string | null }) {
  const [selected, setSelected] = useState<string | null>(initialId);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const searchId = useId();

  useEffect(() => { const t = setTimeout(() => { setQuery(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("c", selected); else url.searchParams.delete("c");
    window.history.replaceState(null, "", url);
  }, [selected]);

  const list = useSWR<List>(`/inbox/data?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page) })}`, fetcher, { refreshInterval: 3000, keepPreviousData: true });
  const thread = useSWR<ThreadData>(selected ? `/inbox/data/${selected}` : null, fetcher, { refreshInterval: 3000 });

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <section aria-label="Conversations" className={`min-w-0 space-y-2 ${selected ? "hidden md:block" : ""}`}>
        <label htmlFor={searchId} className="sr-only">Search conversations by name or phone</label>
        <input id={searchId} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone"
          className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700" />
        {list.error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900"><span aria-hidden="true">⚠ </span>{(list.error as Error).message}</p>}
        {!list.data && !list.error && <p className="text-sm text-stone-600"><Spinner /> Loading conversations…</p>}
        <ul className="space-y-1">
          {list.data?.items.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setSelected(c.id)} aria-current={selected === c.id ? "true" : undefined}
                className={`w-full rounded-lg border p-3 text-left text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 ${selected === c.id ? "border-emerald-600 bg-emerald-50" : "border-stone-200 bg-white hover:bg-stone-50"}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{c.contact.name} <span className="font-normal text-stone-600">· {c.kind === "WEBCHAT" ? "Website chat" : "WhatsApp"}</span></span>
                  <span className="shrink-0 text-xs text-stone-600"><TimeAgo date={c.lastMessageAt} /></span>
                </span>
                <span className="mt-0.5 block truncate text-stone-700">
                  {c.last ? `${c.last.direction === "OUT" ? "You: " : ""}${c.last.body}` : "No messages"}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-stone-600">
                  <span>{c.assignee.name ? `Handled by ${c.assignee.name}` : "Not assigned"}</span>
                  {c.unread > 0 && <Chip tone="info">{c.unread} new</Chip>}
                  {c.contact.optedOut && <Chip tone="bad">Opted out</Chip>}
                  {c.last?.status === "FAILED" && <Chip tone="bad">Send failed</Chip>}
                </span>
              </button>
            </li>
          ))}
          {list.data && list.data.items.length === 0 && (
            <li className="rounded border border-dashed border-stone-300 p-4 text-center text-sm text-stone-600">
              {query ? "No conversations match your search." : "No conversations yet. Customers who message you on the website chat (or WhatsApp) appear here. Use “Try it” above to play the customer."}
            </li>
          )}
        </ul>
        {list.data && list.data.pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">← Newer</button>
            <span>{page} / {list.data.pages}</span>
            <button type="button" disabled={page >= list.data.pages} onClick={() => setPage(page + 1)} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">Older →</button>
          </nav>
        )}
      </section>

      <section aria-label="Conversation" className={`min-w-0 ${selected ? "" : "hidden md:block"}`}>
        {selected && (
          <button type="button" onClick={() => setSelected(null)} className="mb-2 text-sm text-emerald-800 underline md:hidden">← All conversations</button>
        )}
        {!selected && <p className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-sm text-stone-600">Choose a conversation to read and reply.</p>}
        {selected && thread.error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"><span aria-hidden="true">⚠ </span>{(thread.error as Error).message}</p>}
        {selected && !thread.data && !thread.error && <p className="text-sm text-stone-600"><Spinner /> Loading messages…</p>}
        {selected && thread.data && <ThreadView thread={thread.data} onChanged={() => { thread.mutate(); list.mutate(); }} />}
      </section>
    </div>
  );
}

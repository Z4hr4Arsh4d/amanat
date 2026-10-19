"use client";
// P3 owns. Conversation list + thread, live via SWR (3s). On phones you see one at a time.
import { useEffect, useId, useState } from "react";
import useSWR from "swr";
import { Chip } from "@/lib/integrations/ui/StatusChip";
import { TimeAgo } from "@/lib/integrations/ui/TimeAgo";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { ThreadView, type ThreadData } from "@/lib/integrations/ui/Thread";
import { Icon } from "@/components/ui/Icon";
import { Avatar, EmptyState, Notice } from "@/components/ui/Kit";
import { ui } from "@/components/ui/styles";

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
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] md:gap-6">
      <section aria-label="Conversations" className={`min-w-0 space-y-3 ${selected ? "hidden md:block" : ""}`}>
        <label htmlFor={searchId} className="sr-only">Search conversations by name or phone</label>
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input id={searchId} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className={`${ui.input} pl-9`} />
        </div>
        {list.error && <Notice tone="bad">{(list.error as Error).message}</Notice>}
        {!list.data && !list.error && <p className="flex items-center gap-2 text-sm text-stone-600"><Spinner /> Loading conversations…</p>}
        {list.data && list.data.items.length === 0 ? (
          <EmptyState compact icon="inbox" title={query ? "No conversations match your search." : "No conversations yet"}>
            {!query && "Customers who message you on the website chat (or WhatsApp) appear here. Use “Try it” above to play the customer."}
          </EmptyState>
        ) : list.data && (
          <ul className={`${ui.cardFlush} divide-y divide-stone-100`}>
            {list.data.items.map((c) => {
              const on = selected === c.id;
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setSelected(c.id)} aria-current={on ? "true" : undefined}
                    className={`relative flex w-full gap-3 px-4 py-3 text-left text-sm transition-colors ${on ? "bg-emerald-50/70" : "hover:bg-stone-50"}`}>
                    {on && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-emerald-700" />}
                    <Avatar name={c.contact.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate ${c.unread > 0 ? "font-bold text-stone-900" : "font-semibold text-stone-800"}`}>{c.contact.name}</span>
                        <span className="shrink-0 text-[11px] text-stone-500"><TimeAgo date={c.lastMessageAt} /></span>
                      </span>
                      <span className={`mt-0.5 block truncate ${c.unread > 0 ? "text-stone-800" : "text-stone-600"}`}>
                        {c.last ? `${c.last.direction === "OUT" ? "You: " : ""}${c.last.body}` : "No messages"}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-stone-500">
                        <span className="inline-flex items-center gap-1"><Icon name={c.kind === "WEBCHAT" ? "globe" : "whatsapp"} className="h-3 w-3" />{c.kind === "WEBCHAT" ? "Website chat" : "WhatsApp"}</span>
                        <span aria-hidden="true">·</span>
                        <span>{c.assignee.name ? c.assignee.name : "Not assigned"}</span>
                        {c.unread > 0 && <Chip tone="info">{c.unread} new</Chip>}
                        {c.contact.optedOut && <Chip tone="bad">Opted out</Chip>}
                        {c.last?.status === "FAILED" && <Chip tone="bad">Send failed</Chip>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {list.data && list.data.pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={ui.btnSm}><Icon name="chevronLeft" className="h-3.5 w-3.5" />Newer</button>
            <span className="tabular-nums text-stone-600">{page} / {list.data.pages}</span>
            <button type="button" disabled={page >= list.data.pages} onClick={() => setPage(page + 1)} className={ui.btnSm}>Older<Icon name="chevronRight" className="h-3.5 w-3.5" /></button>
          </nav>
        )}
      </section>

      <section aria-label="Conversation" className={`min-w-0 ${selected ? "" : "hidden md:block"}`}>
        {selected && (
          <button type="button" onClick={() => setSelected(null)} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-stone-600 hover:text-stone-900 md:hidden">
            <Icon name="arrowLeft" className="h-4 w-4" /> All conversations
          </button>
        )}
        {!selected && (
          <div className="grid h-full min-h-[24rem] place-items-center rounded-xl border border-dashed border-stone-300 bg-white/60 p-8 text-center">
            <div>
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-stone-100 text-stone-500"><Icon name="inbox" className="h-5 w-5" /></span>
              <p className="mt-3 text-sm font-semibold text-stone-900">Choose a conversation</p>
              <p className="mt-1 text-sm text-stone-600">Pick one on the left to read and reply.</p>
            </div>
          </div>
        )}
        {selected && thread.error && <Notice tone="bad">{(thread.error as Error).message}</Notice>}
        {selected && !thread.data && !thread.error && <p className="flex items-center gap-2 text-sm text-stone-600"><Spinner /> Loading messages…</p>}
        {selected && thread.data && <ThreadView thread={thread.data} onChanged={() => { thread.mutate(); list.mutate(); }} />}
      </section>
    </div>
  );
}

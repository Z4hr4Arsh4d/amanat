"use client";
// P2 owns. Mounted once in the app layout: polls /api/live every 3 seconds, shows toasts, refreshes lists, and draws the bell (Q11, F3.9).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Icon } from "@/components/ui/Icon";
import { ui } from "@/components/ui/styles";
import { listNotifications, markAllNotificationsRead } from "./live-actions";

type Live = {
  now: string; unread: number;
  notifications: { id: string; title: string; body: string; leadId: string | null }[];
  leads: { id: string }[];
  messages: { id: string; contactName: string; body: string }[];
};

const LIST_KEYS = ["leads", "recovery", "team", "my-status", "dashboard"];

export function LivePoller() {
  const since = useRef<string | null>(null);
  const seen = useRef(new Set<string>());
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Close the panel on Escape or a click outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  const { data } = useSWR<Live>("live", async () => {
    const res = await fetch(`/api/live${since.current ? `?since=${encodeURIComponent(since.current)}` : ""}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Live updates paused");
    return res.json();
  }, {
    refreshInterval: 3000,
    onSuccess: (d) => {
      since.current = d.now;
      let changed = false;
      for (const n of d.notifications) {
        if (seen.current.has(n.id)) continue;
        seen.current.add(n.id);
        toast.info(n.title, { description: n.body });
        changed = true;
      }
      for (const m of d.messages) {
        if (seen.current.has(m.id)) continue;
        seen.current.add(m.id);
        toast.info(`New message from ${m.contactName}`, { description: m.body });
      }
      for (const l of d.leads) {
        if (!seen.current.has(l.id)) { seen.current.add(l.id); changed = true; }
      }
      if (changed) {
        mutate((key) => (typeof key === "string" && (LIST_KEYS.includes(key) || key.startsWith("leads:"))) || (Array.isArray(key) && key[0] === "lead-slot"));
        mutate("bell");
      }
    },
  });

  const { data: items } = useSWR(open ? "bell" : null, async () => {
    const r = await listNotifications();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }, { refreshInterval: 3000 });

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={box}>
      <button
        type="button" className={`${ui.btn} relative !px-2.5`} aria-expanded={open} aria-haspopup="true"
        aria-label={`Notifications, ${unread} unread`} onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" className="h-[18px] w-[18px]" />
        <span className="hidden text-[13px] sm:inline">{unread > 0 ? `${unread} new` : "No new"}</span>
        {unread > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold text-white sm:hidden">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] animate-fade-in overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg" role="region" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-bold text-stone-900">Notifications</h2>
            <button
              type="button" className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:text-stone-400 disabled:hover:bg-transparent" disabled={unread === 0}
              onClick={async () => {
                const r = await markAllNotificationsRead();
                if (!r.ok) toast.error(r.error);
                else { toast.success("All marked as read."); mutate("live"); mutate("bell"); }
              }}
            >
              Mark all read
            </button>
          </div>
          {!items && <p className="px-4 py-6 text-center text-sm text-stone-600">Loading…</p>}
          {items && items.length === 0 && (
            <div className="px-4 py-8 text-center">
              <Icon name="bell" className="mx-auto h-5 w-5 text-stone-400" />
              <p className="mt-2 text-sm text-stone-600">You&apos;re all caught up.</p>
            </div>
          )}
          <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
            {items?.map((n) => (
              <li key={n.id} className={`flex gap-3 px-4 py-3 text-sm ${n.read ? "" : "bg-emerald-50/40"}`}>
                <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-emerald-600"}`} />
                <div className="min-w-0 flex-1">
                  <p className={n.read ? "font-medium text-stone-700" : "font-bold text-stone-900"}>{n.read ? "" : <span className="sr-only">Unread: </span>}{n.title}</p>
                  <p className="mt-0.5 break-words text-stone-600">{n.body}</p>
                  {n.leadId && <Link href="/leads" className={`${ui.link} mt-1 inline-block text-xs`} onClick={() => setOpen(false)}>Open leads</Link>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

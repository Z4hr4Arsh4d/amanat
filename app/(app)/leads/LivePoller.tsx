"use client";
// P2 owns. Mount once in the app layout: polls /api/live every 3 seconds, shows toasts, refreshes lists, and draws the bell (Q11, F3.9).
import { useRef, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
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
  const [open, setOpen] = useState(false);

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
        toast.info(`New WhatsApp message from ${m.contactName}`, { description: m.body });
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
    <div className="relative inline-block">
      <button
        type="button" className={ui.btn} aria-expanded={open} aria-haspopup="true"
        aria-label={`Notifications, ${unread} unread`} onClick={() => setOpen((o) => !o)}
      >
        🔔 <span>{unread > 0 ? `${unread} new` : "No new"}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] rounded-xl border border-stone-200 bg-white p-3 shadow-lg" role="region" aria-label="Notifications">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-900">Notifications</h2>
            <button
              type="button" className="text-sm underline" disabled={unread === 0}
              onClick={async () => {
                const r = await markAllNotificationsRead();
                if (!r.ok) toast.error(r.error);
                else { toast.success("All marked as read."); mutate("live"); mutate("bell"); }
              }}
            >
              Mark all read
            </button>
          </div>
          {!items && <p className={ui.muted}>Loading…</p>}
          {items && items.length === 0 && <p className={ui.muted}>Nothing yet.</p>}
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {items?.map((n) => (
              <li key={n.id} className="text-sm">
                <p className={n.read ? "text-stone-700" : "font-semibold text-stone-900"}>{n.read ? "" : "● "}{n.title}</p>
                <p className="text-stone-600">{n.body}</p>
                {n.leadId && <Link href="/leads" className="underline" onClick={() => setOpen(false)}>Open leads</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

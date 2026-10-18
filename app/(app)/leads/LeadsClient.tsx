"use client";
// P2 owns. Leads list with source badge and routing reason; refreshes every 3 seconds (Q11).
import { useState } from "react";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { acknowledgeLead, createManualLead, listLeads, type LeadRow } from "./actions";
import { Countdown } from "./Countdown";
import { StatusSelector } from "./StatusSelector";
import { TeamPanel } from "./TeamPanel";

const SOURCE = { WEB_FORM: "🌐 Web form", WHATSAPP: "💬 WhatsApp", MANUAL: "✍️ Manual" } as const;
const STATUS = {
  NEW: "● New", ASSIGNED: "⏳ Waiting for reply", ACKNOWLEDGED: "✓ Acknowledged", UNASSIGNED: "⚠ Nobody assigned", CLOSED: "Closed",
} as const;

async function fetchLeads(): Promise<{ rows: LeadRow[]; receivedAt: number }> {
  const r = await listLeads();
  if (!r.ok) throw new Error(r.error);
  return { rows: r.data, receivedAt: Date.now() };
}

export function LeadsClient({ canCreate, canManageTeam }: { canCreate: boolean; canManageTeam: boolean }) {
  const { data, error, mutate } = useSWR("leads", fetchLeads, { refreshInterval: 3000 });
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const rows = data?.rows;
  const ack = (id: string) => run(() => acknowledgeLead({ leadId: id }), { success: "Lead acknowledged.", onSuccess: () => mutate() });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className={ui.h1}>Leads</h1>
        {canCreate && (
          <button type="button" className={ui.btnPrimary} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Close" : "New lead"}
          </button>
        )}
      </div>

      <StatusSelector />
      {canManageTeam && <TeamPanel />}

      {open && (
        <form
          className={`${ui.card} grid gap-3 sm:grid-cols-3`}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const v = (k: string) => String(f.get(k) ?? "");
            run(() => createManualLead({ name: v("name"), phone: v("phone"), email: v("email") }), {
              success: "Lead created and assigned.",
              onSuccess: () => { form.reset(); setOpen(false); mutate(); },
            });
          }}
        >
          <div>
            <label htmlFor="nl-name" className={ui.label}>Customer name</label>
            <input id="nl-name" name="name" required maxLength={100} className={ui.input} />
          </div>
          <div>
            <label htmlFor="nl-phone" className={ui.label}>Phone number</label>
            <input id="nl-phone" name="phone" type="tel" required maxLength={30} placeholder="0300 1234567" className={ui.input} />
          </div>
          <div>
            <label htmlFor="nl-email" className={ui.label}>Email (optional)</label>
            <input id="nl-email" name="email" type="email" maxLength={200} className={ui.input} />
          </div>
          <div className="sm:col-span-3">
            <button type="submit" disabled={pending} className={ui.btnPrimary}>{pending ? "Creating…" : "Create lead"}</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-red-800">Could not load leads. {error.message} Check your connection; this page retries on its own.</p>}
      {!data && !error && <p className={ui.muted}>Loading leads…</p>}
      {rows && rows.length === 0 && <p className={ui.muted}>No open leads yet. New leads appear here as soon as they arrive.</p>}

      <ul className="space-y-3">
        {rows?.map((l) => (
          <li key={l.id} className={ui.card}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-stone-900">{l.contactName}</span>
              <span className="rounded-full border border-stone-300 px-2 py-0.5 text-xs text-stone-800">{SOURCE[l.source]}</span>
              <span className="rounded-full border border-stone-300 px-2 py-0.5 text-xs text-stone-800">{STATUS[l.status]}</span>
            </div>
            <p className={`${ui.muted} mt-1`}>Owner: {l.isMine ? "You" : (l.ownerName ?? "nobody yet")}</p>
            {l.msLeft !== null && data && (
              <p className="mt-1 text-sm"><Countdown msLeft={l.msLeft} receivedAt={data.receivedAt} /></p>
            )}
            {l.isMine && l.status === "ASSIGNED" && (
              <button type="button" disabled={pending} onClick={() => ack(l.id)} className={`${ui.btnPrimary} mt-3 w-full px-6 py-3 text-base sm:w-auto`}>
                ✅ Acknowledge
              </button>
            )}
            {l.reason && <p className={`${ui.muted} mt-1`}><span className="font-medium text-stone-800">Why: </span>{l.reason}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

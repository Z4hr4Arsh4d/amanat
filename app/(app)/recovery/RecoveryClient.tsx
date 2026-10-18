"use client";
// P2 owns. Recovery queue list with reason chips (text + icon) and quick actions.
import Link from "next/link";
import useSWR from "swr";
import { ui } from "@/components/ui/styles";
import { ReassignMenu } from "../leads/ReassignMenu";
import { listRecovery } from "./actions";

const ICON: Record<string, string> = { overdue: "⏰", unassigned: "⚠", new: "🆕", escalated: "🔺", idle: "💤", away: "🏖" };
const SOURCE = { WEB_FORM: "🌐 Web form", WHATSAPP: "💬 WhatsApp", MANUAL: "✍️ Manual" } as const;

export function RecoveryClient({ canReassign }: { canReassign: boolean }) {
  const { data, error, mutate } = useSWR("recovery", async () => {
    const r = await listRecovery();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }, { refreshInterval: 3000 });

  return (
    <div className="space-y-4">
      <h1 className={ui.h1}>Recovery queue</h1>
      <p className={ui.muted}>Leads that need a person to step in. They leave this list on their own once they are handled.</p>
      {error && <p role="alert" className="text-sm text-red-800">Could not load the queue. {error.message} This page retries on its own.</p>}
      {!data && !error && <p className={ui.muted}>Loading…</p>}
      {data && data.length === 0 && <p className="text-sm text-stone-800">✅ Nothing needs attention right now.</p>}
      <ul className="space-y-3">
        {data?.map((l) => (
          <li key={l.leadId} className={ui.card}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-stone-900">{l.contactName}</span>
              <span className="rounded-full border border-stone-300 px-2 py-0.5 text-xs text-stone-800">{SOURCE[l.source]}</span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Why this lead is here">
              {l.reasons.map((r) => (
                <li key={r.kind} className="rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                  <span aria-hidden="true">{ICON[r.kind] ?? "⚠"}</span> {r.text}
                </li>
              ))}
            </ul>
            <p className={`${ui.muted} mt-2`}>Owner: {l.ownerName ?? "nobody"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {canReassign && <ReassignMenu leadId={l.leadId} currentOwnerName={l.ownerName} onDone={() => mutate()} />}
              <Link href={`/contacts/${l.contactId}`} className={ui.btn}>Open</Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

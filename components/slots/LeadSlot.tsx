"use client";
// P2 owns this slot. P1 places it on the contact / opportunity pages. Keep the props stable.
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { acknowledgeLead, getContactLead, type ContactLeadInfo } from "@/app/(app)/leads/actions";
import { Countdown } from "@/app/(app)/leads/Countdown";

const STATUS = {
  NEW: "● New", ASSIGNED: "⏳ Waiting for reply", ACKNOWLEDGED: "✓ Acknowledged", UNASSIGNED: "⚠ Nobody assigned", CLOSED: "Closed",
} as const;
const SOURCE = { WEB_FORM: "🌐 Web form", WHATSAPP: "💬 WhatsApp", MANUAL: "✍️ Manual" } as const;
const KIND = { AUTO: "Assigned", ESCALATION: "Escalated", MANUAL: "Reassigned", ABSENCE: "Moved (away)" } as const;

async function fetchInfo(contactId: string): Promise<{ info: ContactLeadInfo; receivedAt: number }> {
  const r = await getContactLead(contactId);
  if (!r.ok) throw new Error(r.error);
  return { info: r.data, receivedAt: Date.now() };
}

export function LeadSlot({ contactId }: { contactId: string }) {
  const { data, error, mutate } = useSWR(["lead-slot", contactId], () => fetchInfo(contactId), { refreshInterval: 3000 });
  const { pending, run } = useAction();

  if (error) return <p role="alert" className="text-sm text-red-800">Could not load the lead. {error.message}</p>;
  if (!data) return <p className={ui.muted}>Loading lead…</p>;
  const { lead, history } = data.info;
  if (!lead) return <section className={ui.card}><h2 className="font-semibold text-stone-900">Lead</h2><p className={`${ui.muted} mt-1`}>This contact has no lead yet.</p></section>;

  return (
    <section className={`${ui.card} space-y-2`} aria-label="Lead">
      <h2 className="font-semibold text-stone-900">Lead</h2>
      <p className="text-sm text-stone-800">
        <span className="rounded-full border border-stone-300 px-2 py-0.5 text-xs">{SOURCE[lead.source]}</span>{" "}
        <span className="rounded-full border border-stone-300 px-2 py-0.5 text-xs">{STATUS[lead.status]}</span>{" "}
        Owner: <span className="font-medium">{lead.isMine ? "You" : (lead.ownerName ?? "nobody yet")}</span>
        {lead.ownerOnLeave && <span className="ml-2 text-amber-900">⚠ Owner away</span>}
      </p>
      {lead.msLeft !== null && <p className="text-sm"><Countdown msLeft={lead.msLeft} receivedAt={data.receivedAt} /></p>}
      {lead.isMine && lead.status === "ASSIGNED" && (
        <button type="button" disabled={pending} className={ui.btnPrimary}
          onClick={() => run(() => acknowledgeLead({ leadId: lead.id }), { success: "Lead acknowledged.", onSuccess: () => mutate() })}>
          ✅ Acknowledge
        </button>
      )}
      {history.length > 0 && (
        <div>
          <h3 className="mt-2 text-sm font-medium text-stone-800">Assignment history</h3>
          <ul className="mt-1 space-y-1">
            {history.map((h) => (
              <li key={h.id} className={ui.muted}>
                <span className="font-medium text-stone-800">{KIND[h.kind as keyof typeof KIND] ?? h.kind}{h.to ? ` to ${h.to}` : ""}</span>
                {" · "}{new Date(h.at).toLocaleString()}{" · "}{h.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

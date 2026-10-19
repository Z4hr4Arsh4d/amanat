"use client";
// P2 owns this slot. P1 places it on the contact / opportunity pages. Keep the props stable.
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { Badge, Notice, Panel } from "@/components/ui/Kit";
import { Spinner } from "@/components/ui/Spinner";
import { acknowledgeLead, getContactLead, type ContactLeadInfo } from "@/app/(app)/leads/actions";
import { Countdown } from "@/app/(app)/leads/Countdown";
import { LeadStatusBadge, SourceBadge } from "@/app/(app)/leads/LeadBadges";

const KIND = { AUTO: "Assigned", ESCALATION: "Escalated", MANUAL: "Reassigned", ABSENCE: "Moved (away)" } as const;

async function fetchInfo(contactId: string): Promise<{ info: ContactLeadInfo; receivedAt: number }> {
  const r = await getContactLead(contactId);
  if (!r.ok) throw new Error(r.error);
  return { info: r.data, receivedAt: Date.now() };
}

export function LeadSlot({ contactId }: { contactId: string }) {
  const { data, error, mutate } = useSWR(["lead-slot", contactId], () => fetchInfo(contactId), { refreshInterval: 3000 });
  const { pending, run } = useAction();

  if (error) return <Panel title="Lead" id="lead-slot"><Notice tone="bad">Could not load the lead. {error.message}</Notice></Panel>;
  if (!data) return <Panel title="Lead" id="lead-slot"><p className={ui.muted}>Loading lead…</p></Panel>;
  const { lead, history } = data.info;
  if (!lead) return <Panel title="Lead" id="lead-slot"><p className={ui.muted}>This contact has no lead yet.</p></Panel>;

  return (
    <Panel title="Lead" id="lead-slot" actions={lead.msLeft !== null ? <Countdown msLeft={lead.msLeft} receivedAt={data.receivedAt} /> : undefined}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceBadge source={lead.source} />
          <LeadStatusBadge status={lead.status} />
          {lead.ownerOnLeave && <Badge tone="warn" icon="plane">Owner away</Badge>}
        </div>
        <p className="text-sm"><span className="text-stone-500">Owner: </span><span className="font-semibold text-stone-900">{lead.isMine ? "You" : (lead.ownerName ?? "Nobody yet")}</span></p>
        {lead.isMine && lead.status === "ASSIGNED" && (
          <button type="button" disabled={pending} className={`${ui.btnPrimary} w-full`}
            onClick={() => run(() => acknowledgeLead({ leadId: lead.id }), { success: "Lead acknowledged.", onSuccess: () => mutate() })}>
            {pending ? <Spinner /> : <Icon name="check" className="h-4 w-4" strokeWidth={2.5} />} Acknowledge
          </button>
        )}
        {history.length > 0 && (
          <div>
            <h3 className={ui.eyebrow}>Assignment history</h3>
            <ol className="mt-2 space-y-3 border-l border-stone-200 pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative text-sm">
                  <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border-2 border-white bg-stone-400 ring-1 ring-stone-300" />
                  <p className="font-semibold text-stone-900">{KIND[h.kind as keyof typeof KIND] ?? h.kind}{h.to ? ` to ${h.to}` : ""}</p>
                  <p className="text-xs text-stone-500">{new Date(h.at).toLocaleString()}</p>
                  {h.reason && <p className="mt-0.5 text-stone-600">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Panel>
  );
}

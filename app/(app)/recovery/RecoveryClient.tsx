"use client";
// P2 owns. Recovery queue list with reason chips (text + icon) and quick actions.
import Link from "next/link";
import useSWR from "swr";
import { ui } from "@/components/ui/styles";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui/Kit";
import { ReassignMenu } from "../leads/ReassignMenu";
import { SourceBadge } from "../leads/LeadBadges";
import { listRecovery } from "./actions";

const ICON: Record<string, IconName> = { overdue: "clock", unassigned: "alert", new: "dot", escalated: "arrowUp", idle: "moon", away: "plane" };

export function RecoveryClient({ canReassign }: { canReassign: boolean }) {
  const { data, error, mutate } = useSWR("recovery", async () => {
    const r = await listRecovery();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }, { refreshInterval: 3000 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recovery queue"
        description="Leads that need a person to step in. They leave this list on their own once they are handled."
        actions={data && data.length > 0 && <Badge tone="warn" icon="alert">{data.length} need attention</Badge>}
      />
      {error && <Notice tone="bad" title="Could not load the queue.">{error.message} This page retries on its own.</Notice>}
      {!data && !error && (
        <div className="space-y-3" aria-busy="true">
          <p className="sr-only" role="status">Loading…</p>
          {[0, 1].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl border border-stone-200 bg-white" />)}
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState icon="checkCircle" title="Nothing needs attention right now">
          Overdue, unassigned and idle leads show up here automatically.
        </EmptyState>
      )}
      <ul className="grid gap-3 lg:grid-cols-2">
        {data?.map((l) => (
          <li key={l.leadId} className="flex flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/contacts/${l.contactId}`} className="min-w-0 truncate text-base font-bold text-stone-900 hover:text-emerald-800 hover:underline">{l.contactName}</Link>
              <SourceBadge source={l.source} />
            </div>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Why this lead is here">
              {l.reasons.map((r) => (
                <li key={r.kind}><Badge tone="warn" icon={ICON[r.kind] ?? "alert"}>{r.text}</Badge></li>
              ))}
            </ul>
            <p className="mt-3 text-sm"><span className="text-stone-500">Owner: </span><span className="font-semibold text-stone-900">{l.ownerName ?? "Nobody"}</span></p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
              {canReassign ? <ReassignMenu leadId={l.leadId} currentOwnerName={l.ownerName} onDone={() => mutate()} /> : <span />}
              <Link href={`/contacts/${l.contactId}`} className={ui.btnSm}>Open contact <Icon name="arrowRight" className="h-3.5 w-3.5" /></Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

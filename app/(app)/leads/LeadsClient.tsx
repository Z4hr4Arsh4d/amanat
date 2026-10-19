"use client";
// P2 owns. Leads list with source badge and routing reason; refreshes every 3 seconds (Q11).
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Notice, PageHeader } from "@/components/ui/Kit";
import { Spinner } from "@/components/ui/Spinner";
import { acknowledgeLead, createManualLead, listLeads, type LeadRow } from "./actions";
import { Countdown } from "./Countdown";
import { AwayNotice } from "./StatusSelector";
import { TeamPanel } from "./TeamPanel";
import { ReassignMenu } from "./ReassignMenu";
import { LeadStatusBadge, SourceBadge } from "./LeadBadges";

const FILTER_LABEL: Record<string, string> = { today: "new leads today", escalated24h: "leads escalated in the last 24 hours (a lead escalated twice appears once)" };

async function fetchLeads(filter?: string): Promise<{ rows: LeadRow[]; receivedAt: number }> {
  const r = await listLeads({ filter });
  if (!r.ok) throw new Error(r.error);
  return { rows: r.data, receivedAt: Date.now() };
}

export function LeadsClient({ canCreate, canManageTeam, canReassign, filter }: { canCreate: boolean; canManageTeam: boolean; canReassign: boolean; filter?: string }) {
  const { data, error, mutate } = useSWR(filter ? `leads:${filter}` : "leads", () => fetchLeads(filter), { refreshInterval: 3000 });
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const rows = data?.rows;
  const ack = (id: string) => run(() => acknowledgeLead({ leadId: id }), { success: "Lead acknowledged.", onSuccess: () => mutate() });
  const waitingOnMe = rows?.filter((l) => l.isMine && l.status === "ASSIGNED").length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="New enquiries and who is handling them. Acknowledge yours before the timer runs out, or the lead moves to the next person."
        actions={canCreate && (
          <button type="button" className={open ? ui.btn : ui.btnPrimary} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Icon name={open ? "x" : "plus"} className="h-4 w-4" /> {open ? "Close" : "New lead"}
          </button>
        )}
      />

      {filter && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-800">
          <Icon name="filter" className="h-4 w-4 text-stone-500" />
          <span>Showing {FILTER_LABEL[filter] ?? "filtered leads"}.</span>
          <Link href="/leads" className={ui.link}>Show all my open leads</Link>
        </div>
      )}
      <AwayNotice />

      {open && (
        <form
          className={`${ui.card} animate-fade-in space-y-4`}
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
            <h2 className={ui.h2}>Add a lead by hand</h2>
            <p className={`${ui.muted} mt-0.5`}>For walk-ins and phone calls. It is assigned to someone right away.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className={ui.field}>
              <label htmlFor="nl-name" className={ui.label}>Customer name</label>
              <input id="nl-name" name="name" required maxLength={100} autoComplete="off" placeholder="e.g. Ahmed Raza" className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="nl-phone" className={ui.label}>Phone number</label>
              <input id="nl-phone" name="phone" type="tel" required maxLength={30} placeholder="0300 1234567" className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="nl-email" className={ui.label}>Email <span className="font-normal text-stone-500">(optional)</span></label>
              <input id="nl-email" name="email" type="email" maxLength={200} placeholder="name@example.com" className={ui.input} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />}{pending ? "Creating…" : "Create lead"}</button>
            <button type="button" className={ui.btn} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className={canManageTeam ? "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]" : ""}>
        <section aria-labelledby="open-leads" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="open-leads" className={ui.h2}>
              Open leads {rows && <span className="font-semibold tabular-nums text-stone-500">({rows.length})</span>}
            </h2>
            {waitingOnMe > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <Icon name="clock" className="h-4 w-4" /> {waitingOnMe} waiting for you
              </span>
            )}
          </div>

          {error && <Notice tone="bad" title="Could not load leads.">{error.message} Check your connection; this page retries on its own.</Notice>}
          {!data && !error && (
            <div className="space-y-3" aria-busy="true">
              <p className="sr-only" role="status">Loading leads…</p>
              {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-stone-200 bg-white" />)}
            </div>
          )}
          {rows && rows.length === 0 && (
            <EmptyState icon="leads" title={filter ? "No leads match this view" : "No open leads"}>
              New leads from the web form, website chat and WhatsApp appear here as soon as they arrive.
            </EmptyState>
          )}

          <ul className="space-y-3">
            {rows?.map((l) => {
              const mineWaiting = l.isMine && l.status === "ASSIGNED";
              return (
                <li key={l.id} className={`rounded-xl border bg-white p-4 shadow-xs sm:p-5 ${mineWaiting ? "border-amber-300 ring-1 ring-amber-200" : "border-stone-200"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <Link href={`/contacts/${l.contactId}`} className="block truncate text-base font-bold text-stone-900 hover:text-emerald-800 hover:underline">{l.contactName}</Link>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SourceBadge source={l.source} />
                        <LeadStatusBadge status={l.status} />
                      </div>
                    </div>
                    {l.msLeft !== null && data && <Countdown msLeft={l.msLeft} receivedAt={data.receivedAt} />}
                  </div>
                  <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <dl className="min-w-0 space-y-1 text-sm">
                      <div className="flex gap-1.5">
                        <dt className="text-stone-500">Owner:</dt>
                        <dd className="font-semibold text-stone-900">{l.isMine ? "You" : (l.ownerName ?? "Nobody yet")}</dd>
                      </div>
                      {l.reason && (
                        <div className="flex gap-1.5">
                          <dt className="shrink-0 text-stone-500">Why:</dt>
                          <dd className="text-stone-700">{l.reason}</dd>
                        </div>
                      )}
                    </dl>
                    {canReassign && l.status !== "NEW" && <div className="shrink-0"><ReassignMenu leadId={l.id} currentOwnerName={l.ownerName} onDone={() => mutate()} /></div>}
                  </div>
                  {mineWaiting && (
                    <button type="button" disabled={pending} onClick={() => ack(l.id)} className={`${ui.btnPrimary} mt-4 !h-11 w-full !px-6 !text-[15px] sm:w-auto`}>
                      {pending ? <Spinner /> : <Icon name="check" className="h-4 w-4" strokeWidth={2.5} />} Acknowledge
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {canManageTeam && <aside className="min-w-0 xl:sticky xl:top-24"><TeamPanel /></aside>}
      </div>
    </div>
  );
}

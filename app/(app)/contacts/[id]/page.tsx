// P1 owns. F2.8 contact page: header, opportunities, P2/P3 slots, timeline (who + when).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserPage, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NoAccess } from "@/components/ui/NoAccess";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { FieldValues } from "@/components/ui/DynamicFields";
import { Timeline } from "@/components/ui/Timeline";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { AddSummary, Avatar, Badge, Detail, EmptyState, Panel } from "@/components/ui/Kit";
import { ConversationSlot } from "@/components/slots/ConversationSlot";
import { PaymentsSlot } from "@/components/slots/PaymentsSlot";
import { AppointmentsSlot } from "@/components/slots/AppointmentsSlot";
import { LeadSlot } from "@/components/slots/LeadSlot";
import { activeFields } from "@/lib/crm/fields";
import { nameMap, teamOptions } from "@/lib/crm/people";
import { allOpportunityFields, pipelinesWithStages } from "@/lib/crm/pipelines";
import { formatMoney, serializeOpportunity } from "@/lib/crm/serialize";
import * as timeline from "@/lib/crm/timeline";
import { OpportunityCreateForm } from "../../opportunities/OpportunityCreateForm";
import { ContactActions } from "./ContactActions";
import { NoteForm } from "./NoteForm";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUserPage();
  if (!can(ctx, "crm.view")) return <NoAccess what="view contacts" />;
  const { id } = await params;
  const db = scoped(ctx);
  const c = await db.contact.findFirst({ where: { id, deletedAt: null }, include: { company: { select: { id: true, name: true, deletedAt: true } } } });
  if (!c) notFound(); // also for ids from another workspace (F1.6)

  const [defs, team, companies, opps, entries, pipelines, oppDefs] = await Promise.all([
    activeFields(db, "CONTACT"),
    teamOptions(db),
    db.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true } }),
    db.opportunity.findMany({ where: { contactId: c.id, deletedAt: null }, orderBy: { createdAt: "desc" }, include: { stage: { select: { name: true, kind: true } } } }),
    timeline.list(ctx.workspaceId, { contactId: c.id }),
    pipelinesWithStages(db),
    allOpportunityFields(db),
  ]);
  const names = nameMap(team);
  const cf = (c.customFields ?? {}) as Record<string, unknown>;
  const company = c.company && !c.company.deletedAt ? c.company : null;

  const stageIcon = (kind: string) => (kind === "WON" ? "trophy" : kind === "LOST" ? "xCircle" : "dot") as "trophy" | "xCircle" | "dot";
  const stageTone = (kind: string) => (kind === "WON" ? "ok" : kind === "LOST" ? "bad" : "neutral") as "ok" | "bad" | "neutral";

  return (
    <article className="space-y-6">
      <AutoRefresh />
      <Link href="/contacts" className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
        <Icon name="arrowLeft" className="h-4 w-4" /> Contacts
      </Link>

      <header className={`${ui.card} space-y-5`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={c.name} size="lg" />
            <div className="min-w-0">
              <h1 className={`${ui.h1} break-words`}>{c.name}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-stone-600">
                <Icon name="building" className="h-4 w-4 text-stone-400" />
                {company ? <Link href={`/contacts?company=${company.id}`} className={ui.link}>{company.name}</Link> : "No company"}
              </p>
            </div>
          </div>
          {c.optedOut && (
            <Badge tone="bad" icon="ban" className="self-start !px-2.5 !py-1 !text-[13px]">
              Opted out{c.optedOutAt ? ` on ${c.optedOutAt.toLocaleDateString("en-GB", { timeZone: ctx.timezone })}` : ""}
            </Badge>
          )}
        </div>
        <dl className="grid gap-x-6 gap-y-4 border-t border-stone-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Phone" icon="phone">{c.phone ? <span className="break-all tabular-nums">{c.phone}</span> : "—"}</Detail>
          <Detail label="Email" icon="mail">{c.email ? <a href={`mailto:${c.email}`} className="break-all hover:underline">{c.email}</a> : "—"}</Detail>
          <Detail label="Assigned to" icon="user">{c.ownerId ? names.get(c.ownerId) ?? "Former user" : "Nobody"}</Detail>
          <Detail label="Tags" icon="tag">{c.tags.length ? c.tags.map((t) => `#${t}`).join(" ") : "—"}</Detail>
        </dl>
        {defs.length > 0 && <div className="border-t border-stone-100 pt-5"><FieldValues defs={defs} values={cf} /></div>}
        <ContactActions
          initial={{
            id: c.id, version: c.version, name: c.name, email: c.email ?? "", phone: c.phone ?? "", companyId: company?.id ?? "",
            ownerId: c.ownerId ?? "", tags: c.tags.join(", "), customFields: cf,
          }}
          defs={defs} companies={companies} team={team}
          canEdit={can(ctx, "crm.edit")} canDelete={can(ctx, "crm.delete")} opportunities={opps.length}
        />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-6">
          <Panel id="opps" title={<>Opportunities <span className="font-semibold tabular-nums text-stone-500">({opps.length})</span></>} flush>
            {opps.length === 0 ? (
              <div className="p-5"><EmptyState compact icon="target" title="No opportunities yet">Create one below when this contact is interested in a deal.</EmptyState></div>
            ) : (
              <ul className="divide-y divide-stone-100">
                {opps.map((o) => {
                  const s = serializeOpportunity(o, ctx);
                  return (
                    <li key={o.id}>
                      <Link href={`/opportunities/${o.id}`} className="flex flex-col gap-1.5 px-5 py-3.5 text-sm transition-colors hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between">
                        <span className="break-words font-semibold text-stone-900">{o.title}</span>
                        <span className="flex flex-wrap items-center gap-3">
                          <Badge tone={stageTone(o.stage.kind)} icon={stageIcon(o.stage.kind)}>{o.stage.name}</Badge>
                          <span className="font-semibold tabular-nums text-stone-900">{formatMoney(s.value, s.currency, s.valueMasked)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {can(ctx, "crm.create") && (
              <details className="border-t border-stone-200">
                <AddSummary>New opportunity for {c.name}</AddSummary>
                <div className="border-t border-stone-100 p-5"><OpportunityCreateForm contactId={c.id} pipelines={pipelines} defs={oppDefs} team={team} goToNew={false} /></div>
              </details>
            )}
          </Panel>

          <ConversationSlot contactId={c.id} />

          <Panel id="tl" title="History" description="Notes, messages, stage changes and edits, newest first.">
            <div className="space-y-6">
              {can(ctx, "crm.edit") && <NoteForm contactId={c.id} />}
              <Timeline entries={entries} tz={ctx.timezone} />
            </div>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Lead, payments and appointments">
          <LeadSlot contactId={c.id} />
          <PaymentsSlot contactId={c.id} />
          <AppointmentsSlot contactId={c.id} />
        </aside>
      </div>
    </article>
  );
}

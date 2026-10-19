// P1 owns. Opportunity page: stage move, edit, P3 payment/appointment slots, history.
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
import { Badge, Detail, Panel } from "@/components/ui/Kit";
import { PaymentRequestSlot } from "@/components/slots/PaymentRequestSlot";
import { PaymentsSlot } from "@/components/slots/PaymentsSlot";
import { BookAppointmentSlot } from "@/components/slots/BookAppointmentSlot";
import { AppointmentsSlot } from "@/components/slots/AppointmentsSlot";
import { activeFields } from "@/lib/crm/fields";
import { nameMap, teamOptions } from "@/lib/crm/people";
import { formatMoney, serializeOpportunity } from "@/lib/crm/serialize";
import * as timeline from "@/lib/crm/timeline";
import { NoteForm } from "../../contacts/[id]/NoteForm";
import { MoveStage } from "../MoveStage";
import { OpportunityEdit } from "./OpportunityEdit";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUserPage();
  if (!can(ctx, "crm.view")) return <NoAccess what="view opportunities" />;
  const { id } = await params;
  const db = scoped(ctx);
  const o = await db.opportunity.findFirst({
    where: { id, deletedAt: null },
    include: {
      contact: { select: { id: true, name: true, deletedAt: true } },
      pipeline: { select: { name: true, stages: { orderBy: { order: "asc" }, select: { id: true, name: true, requiredFieldIds: true } } } },
      stage: { select: { name: true, kind: true, requiredFieldIds: true } },
    },
  });
  if (!o || o.contact.deletedAt) notFound();

  const [defs, team, entries] = await Promise.all([
    activeFields(db, "OPPORTUNITY", o.pipelineId),
    teamOptions(db),
    timeline.list(ctx.workspaceId, { opportunityId: o.id }),
  ]);
  const s = serializeOpportunity(o, ctx);
  const names = nameMap(team);
  const nextStage = o.pipeline.stages[o.pipeline.stages.findIndex((x) => x.id === o.stageId) + 1];
  const neededSoon = [...new Set([...o.stage.requiredFieldIds, ...(nextStage?.requiredFieldIds ?? [])])];

  const kindIcon = o.stage.kind === "WON" ? "trophy" : o.stage.kind === "LOST" ? "xCircle" : "dot";
  const kindTone = o.stage.kind === "WON" ? "ok" : o.stage.kind === "LOST" ? "bad" : "neutral";
  const stageIndex = o.pipeline.stages.findIndex((x) => x.id === o.stageId);

  return (
    <article className="space-y-6">
      <AutoRefresh />
      <Link href="/opportunities" className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
        <Icon name="arrowLeft" className="h-4 w-4" /> Opportunities
      </Link>

      <header className={`${ui.card} space-y-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className={`${ui.h1} break-words`}>{o.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <Badge tone={kindTone} icon={kindIcon}>{o.stage.name}</Badge>
              <span>in {o.pipeline.name}</span>
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight text-stone-900 sm:text-right">
            <span className="block text-xs font-semibold uppercase tracking-wider text-stone-500">Value</span>
            {formatMoney(s.value, s.currency, s.valueMasked)}
          </p>
        </div>

        <ol aria-label="Stages" className="flex gap-1">
          {o.pipeline.stages.map((st, i) => (
            <li key={st.id} className="min-w-0 flex-1">
              <span aria-hidden="true" className={`block h-1.5 rounded-full ${i <= stageIndex ? (o.stage.kind === "LOST" ? "bg-red-400" : "bg-emerald-600") : "bg-stone-200"}`} />
              <span className={`mt-1.5 hidden truncate text-[11px] font-semibold sm:block ${i === stageIndex ? "text-stone-900" : "text-stone-500"}`}>
                {st.name}{i === stageIndex && <span className="sr-only"> (current stage)</span>}
              </span>
              {i === stageIndex && <span className="sr-only sm:hidden">Current stage: {st.name}</span>}
            </li>
          ))}
        </ol>

        <dl className="grid gap-x-6 gap-y-4 border-t border-stone-100 pt-5 sm:grid-cols-3">
          <Detail label="Contact" icon="user"><Link href={`/contacts/${o.contact.id}`} className={ui.link}>{o.contact.name}</Link></Detail>
          <Detail label="Owner" icon="userCog">{o.ownerId ? names.get(o.ownerId) ?? "Former user" : "Nobody"}</Detail>
          <Detail label="Pipeline" icon="columns">{o.pipeline.name}</Detail>
        </dl>
        {defs.length > 0 && <div className="border-t border-stone-100 pt-5"><FieldValues defs={defs} values={s.customFields} /></div>}
        {can(ctx, "crm.edit") && (
          <div className="max-w-xs border-t border-stone-100 pt-5">
            <MoveStage opportunityId={o.id} version={o.version} stageId={o.stageId} stages={o.pipeline.stages} label="Stage (move to)" />
          </div>
        )}
        <OpportunityEdit
          initial={{ id: o.id, version: o.version, title: o.title, value: s.value, valueMasked: s.valueMasked, currency: o.currency, ownerId: o.ownerId ?? "", customFields: s.customFields }}
          defs={defs} required={neededSoon} team={team} canEdit={can(ctx, "crm.edit")} canDelete={can(ctx, "crm.delete")}
        />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-6">
          <PaymentRequestSlot opportunityId={o.id} />
          <BookAppointmentSlot contactId={o.contact.id} opportunityId={o.id} />
          <Panel id="otl" title="History" description="Notes, stage changes and edits, newest first.">
            <div className="space-y-6">
              {can(ctx, "crm.edit") && <NoteForm contactId={o.contact.id} opportunityId={o.id} />}
              <Timeline entries={entries} tz={ctx.timezone} />
            </div>
          </Panel>
        </div>
        <aside className="min-w-0 space-y-6" aria-label="Payments and appointments">
          <PaymentsSlot opportunityId={o.id} />
          <AppointmentsSlot opportunityId={o.id} />
        </aside>
      </div>
    </article>
  );
}

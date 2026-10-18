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

  return (
    <article className="space-y-6">
      <AutoRefresh />
      <p className="text-sm"><Link href="/opportunities" className="text-emerald-800 underline">← Opportunities</Link></p>

      <header className={`${ui.card} space-y-3`}>
        <h1 className={`${ui.h1} break-words`}>{o.title}</h1>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0"><dt className="text-stone-600">Contact</dt><dd className="break-words font-medium"><Link href={`/contacts/${o.contact.id}`} className="text-emerald-800 underline">{o.contact.name}</Link></dd></div>
          <div><dt className="text-stone-600">Value</dt><dd className="font-medium">{formatMoney(s.value, s.currency, s.valueMasked)}</dd></div>
          <div><dt className="text-stone-600">Pipeline · Stage</dt><dd className="font-medium">{o.pipeline.name} · {o.stage.kind === "WON" ? "🏆" : o.stage.kind === "LOST" ? "✗" : "●"} {o.stage.name}</dd></div>
          <div><dt className="text-stone-600">Owner</dt><dd className="font-medium">👤 {o.ownerId ? names.get(o.ownerId) ?? "Former user" : "Nobody"}</dd></div>
        </dl>
        <FieldValues defs={defs} values={s.customFields} />
        {can(ctx, "crm.edit") && (
          <div className="max-w-xs">
            <MoveStage opportunityId={o.id} version={o.version} stageId={o.stageId} stages={o.pipeline.stages} label="Stage (move to)" />
          </div>
        )}
        <OpportunityEdit
          initial={{ id: o.id, version: o.version, title: o.title, value: s.value, valueMasked: s.valueMasked, currency: o.currency, ownerId: o.ownerId ?? "", customFields: s.customFields }}
          defs={defs} required={neededSoon} team={team} canEdit={can(ctx, "crm.edit")} canDelete={can(ctx, "crm.delete")}
        />
      </header>

      <PaymentRequestSlot opportunityId={o.id} />
      <PaymentsSlot opportunityId={o.id} />
      <BookAppointmentSlot contactId={o.contact.id} opportunityId={o.id} />
      <AppointmentsSlot opportunityId={o.id} />

      <section aria-labelledby="otl-h" className={`${ui.card} space-y-4`}>
        <h2 id="otl-h" className="text-lg font-semibold">History</h2>
        {can(ctx, "crm.edit") && <NoteForm contactId={o.contact.id} opportunityId={o.id} />}
        <Timeline entries={entries} tz={ctx.timezone} />
      </section>
    </article>
  );
}

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

  return (
    <article className="space-y-6">
      <AutoRefresh />
      <p className="text-sm"><Link href="/contacts" className="text-emerald-800 underline">← Contacts</Link></p>

      <header className={`${ui.card} space-y-3`}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className={`${ui.h1} break-words`}>{c.name}</h1>
            <p className="text-sm text-stone-600">
              {company ? <Link href={`/contacts?company=${company.id}`} className="underline">{company.name}</Link> : "No company"}
            </p>
          </div>
          {c.optedOut && (
            <span className="self-start rounded bg-red-100 px-2 py-1 text-sm font-medium text-red-800">
              ⊘ Opted out{c.optedOutAt ? ` on ${c.optedOutAt.toLocaleDateString("en-GB", { timeZone: ctx.timezone })}` : ""}
            </span>
          )}
        </div>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0"><dt className="text-stone-600">Phone</dt><dd className="break-all font-medium">{c.phone ?? "—"}</dd></div>
          <div className="min-w-0"><dt className="text-stone-600">Email</dt><dd className="break-all font-medium">{c.email ?? "—"}</dd></div>
          <div className="min-w-0"><dt className="text-stone-600">Assigned to</dt><dd className="font-medium">👤 {c.ownerId ? names.get(c.ownerId) ?? "Former user" : "Nobody"}</dd></div>
          <div className="min-w-0"><dt className="text-stone-600">Tags</dt><dd className="break-words font-medium">{c.tags.length ? c.tags.map((t) => `#${t}`).join(" ") : "—"}</dd></div>
        </dl>
        <FieldValues defs={defs} values={cf} />
        <ContactActions
          initial={{
            id: c.id, version: c.version, name: c.name, email: c.email ?? "", phone: c.phone ?? "", companyId: company?.id ?? "",
            ownerId: c.ownerId ?? "", tags: c.tags.join(", "), customFields: cf,
          }}
          defs={defs} companies={companies} team={team}
          canEdit={can(ctx, "crm.edit")} canDelete={can(ctx, "crm.delete")} opportunities={opps.length}
        />
      </header>

      <LeadSlot contactId={c.id} />

      <section aria-labelledby="opps-h" className={`${ui.card} space-y-3`}>
        <h2 id="opps-h" className="text-lg font-semibold">Opportunities ({opps.length})</h2>
        {opps.length === 0 ? <p className={ui.muted}>No opportunities yet.</p> : (
          <ul className="divide-y divide-stone-200">
            {opps.map((o) => {
              const s = serializeOpportunity(o, ctx);
              return (
                <li key={o.id} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:justify-between">
                  <Link href={`/opportunities/${o.id}`} className="break-words font-medium text-emerald-800 underline">{o.title}</Link>
                  <span className="text-stone-700">{o.stage.kind === "WON" ? "🏆" : o.stage.kind === "LOST" ? "✗" : "●"} {o.stage.name} · {formatMoney(s.value, s.currency, s.valueMasked)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {can(ctx, "crm.create") && (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-emerald-800">＋ New opportunity for {c.name}</summary>
            <div className="mt-3"><OpportunityCreateForm contactId={c.id} pipelines={pipelines} defs={oppDefs} team={team} goToNew={false} /></div>
          </details>
        )}
      </section>

      <ConversationSlot contactId={c.id} />
      <PaymentsSlot contactId={c.id} />
      <AppointmentsSlot contactId={c.id} />

      <section aria-labelledby="tl-h" className={`${ui.card} space-y-4`}>
        <h2 id="tl-h" className="text-lg font-semibold">History</h2>
        {can(ctx, "crm.edit") && <NoteForm contactId={c.id} />}
        <Timeline entries={entries} tz={ctx.timezone} />
      </section>
    </article>
  );
}

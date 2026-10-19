// P1 owns. F2.1 list view + F2.4 board view (?view=board). Values masked per F1.4.
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUserPage, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NoAccess } from "@/components/ui/NoAccess";
import { Pagination } from "@/components/ui/Pagination";
import { SearchBox } from "@/components/ui/SearchBox";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { AddSummary, Badge, EmptyState, PageHeader } from "@/components/ui/Kit";
import { FilterBar } from "@/components/slots/FilterBar";
import { PAGE_SIZE, nameMap, pageFrom, qFrom, teamOptions } from "@/lib/crm/people";
import { allOpportunityFields, pipelinesWithStages } from "@/lib/crm/pipelines";
import { formatMoney, serializeOpportunity } from "@/lib/crm/serialize";
import { Board } from "./Board";
import { OpportunityCreateForm } from "./OpportunityCreateForm";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireUserPage();
  if (!can(ctx, "crm.view")) return <NoAccess what="view opportunities" />;
  const sp = await searchParams;
  const view = qFrom(sp.view) === "board" ? "board" : "list";
  const q = qFrom(sp.q);
  const stageFilter = qFrom(sp.stage);
  const page = pageFrom(sp.page);
  const db = scoped(ctx);
  const pipelines = await pipelinesWithStages(db);
  const pipeline =
    pipelines.find((p) => p.id === qFrom(sp.pipeline)) ??
    (stageFilter ? pipelines.find((p) => p.stages.some((s) => s.id === stageFilter)) : undefined) ??
    pipelines.find((p) => p.isDefault) ?? pipelines[0];

  const where: Prisma.OpportunityWhereInput = {
    deletedAt: null,
    contact: { deletedAt: null },
    ...(pipeline ? { pipelineId: pipeline.id } : {}),
    ...(stageFilter ? { stageId: stageFilter } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { contact: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const take = view === "board" ? 300 : PAGE_SIZE;
  const [total, rows, team, contacts, oppDefs] = await Promise.all([
    db.opportunity.count({ where }),
    db.opportunity.findMany({
      where, orderBy: { createdAt: "desc" }, skip: view === "board" ? 0 : (page - 1) * PAGE_SIZE, take,
      include: { contact: { select: { name: true } }, stage: { select: { name: true, kind: true } } },
    }),
    teamOptions(db),
    can(ctx, "crm.create")
      ? db.contact.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true } })
      : Promise.resolve([]),
    allOpportunityFields(db),
  ]);
  const names = nameMap(team);
  const items = rows.map((o) => ({ ...serializeOpportunity(o, ctx), contactName: o.contact.name, stageName: o.stage.name, stageKind: o.stage.kind }));
  const base: Record<string, string> = { view };
  if (pipeline) base.pipeline = pipeline.id;
  if (q) base.q = q;
  if (stageFilter) base.stage = stageFilter;
  const tab = (v: string) => `/opportunities?${new URLSearchParams({ ...base, view: v }).toString()}`;
  const seg = (on: boolean) => `inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors ${on ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : "text-stone-600 hover:text-stone-900"}`;
  const pill = (on: boolean) => `inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors ${on ? "border-emerald-800 bg-emerald-800 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50"}`;
  const stageIcon = (kind: string) => (kind === "WON" ? "trophy" : kind === "LOST" ? "xCircle" : "dot") as "trophy" | "xCircle" | "dot";
  const stageTone = (kind: string) => (kind === "WON" ? "ok" : kind === "LOST" ? "bad" : "neutral") as "ok" | "bad" | "neutral";
  const stages = pipeline?.stages ?? [];
  const canEdit = can(ctx, "crm.edit");
  const stageName = stageFilter ? stages.find((x) => x.id === stageFilter)?.name : null;

  return (
    <section className="space-y-6">
      <AutoRefresh />
      <PageHeader
        title="Opportunities"
        description="Deals moving through your pipeline."
        actions={
          <>
            <nav aria-label="View" className="inline-flex rounded-lg bg-stone-100 p-1">
              <Link href={tab("list")} className={seg(view === "list")} aria-current={view === "list" ? "page" : undefined}><Icon name="list" className="h-4 w-4" />List</Link>
              <Link href={tab("board")} className={seg(view === "board")} aria-current={view === "board" ? "page" : undefined}><Icon name="board" className="h-4 w-4" />Board</Link>
            </nav>
            {can(ctx, "crm.export") && <a href="/api/export/opportunities" className={ui.btn} download><Icon name="download" className="h-4 w-4" />Export CSV</a>}
          </>
        }
      />

      {pipelines.length > 1 && (
        <nav aria-label="Pipelines" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-stone-500">Pipeline</span>
          {pipelines.map((p) => (
            <Link key={p.id} href={`/opportunities?${new URLSearchParams({ view, pipeline: p.id }).toString()}`} className={pill(p.id === pipeline?.id)} aria-current={p.id === pipeline?.id ? "page" : undefined}>
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      {can(ctx, "crm.create") && (
        <details className={ui.cardFlush}>
          <AddSummary>New opportunity</AddSummary>
          <div className="border-t border-stone-200 p-5"><OpportunityCreateForm contacts={contacts} pipelines={pipelines} defs={oppDefs} team={team} /></div>
        </details>
      )}

      <div className="space-y-3">
        <FilterBar entity="opportunity" />
        <SearchBox q={q} placeholder="Search by title or contact" hidden={{ view, ...(pipeline ? { pipeline: pipeline.id } : {}) }} />
        {stageFilter && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
            <Icon name="filter" className="h-4 w-4 text-stone-500" />
            Showing stage <strong className="text-stone-900">{stageName ?? "selected"}</strong>
            <Link href={tab(view).replace(/&?stage=[^&]*/, "")} className={ui.link}>Show all stages</Link>
          </p>
        )}
      </div>

      {view === "board" ? (
        <Board
          stages={stages}
          items={items.map((o) => ({ id: o.id, title: o.title, contactName: o.contactName, money: formatMoney(o.value, o.currency, o.valueMasked), stageId: o.stageId, version: o.version }))}
          canEdit={canEdit}
        />
      ) : items.length === 0 ? (
        <EmptyState icon="target" title={q ? `No opportunities match “${q}”` : "No opportunities found"}>
          {q || stageFilter ? "Try another search, or clear the stage filter." : "Create one from a contact page or with “New opportunity” above."}
        </EmptyState>
      ) : (
        <div className={ui.cardFlush}>
          <table className="hidden w-full text-sm md:table">
            <caption className="sr-only">Opportunities</caption>
            <thead className="border-b border-stone-200 bg-stone-50/70">
              <tr>
                <th scope="col" className={ui.th}>Title</th>
                <th scope="col" className={ui.th}>Contact</th>
                <th scope="col" className={ui.th}>Stage</th>
                <th scope="col" className={`${ui.th} !text-right`}>Value</th>
                <th scope="col" className={ui.th}>Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.map((o) => (
                <tr key={o.id} className={ui.row}>
                  <td className="max-w-[18rem] px-4 py-3"><Link href={`/opportunities/${o.id}`} className="block truncate font-semibold text-stone-900 hover:text-emerald-800 hover:underline">{o.title}</Link></td>
                  <td className="max-w-[12rem] truncate px-4 py-3 text-stone-700">{o.contactName}</td>
                  <td className="px-4 py-3"><Badge tone={stageTone(o.stageKind)} icon={stageIcon(o.stageKind)}>{o.stageName}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-stone-900">{formatMoney(o.value, o.currency, o.valueMasked)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-700">{o.ownerId ? names.get(o.ownerId) ?? "—" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-stone-100 md:hidden">
            {items.map((o) => (
              <li key={o.id}>
                <Link href={`/opportunities/${o.id}`} className="block space-y-1.5 px-4 py-3.5 text-sm hover:bg-stone-50">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words font-semibold text-stone-900">{o.title}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-stone-900">{formatMoney(o.value, o.currency, o.valueMasked)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-stone-600">
                    <Badge tone={stageTone(o.stageKind)} icon={stageIcon(o.stageKind)}>{o.stageName}</Badge>
                    <span className="break-words">{o.contactName}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {view === "list" && <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/opportunities" params={base} />}
      {view === "board" && total > take && <p className={ui.muted}>Showing the newest {take} of {total}. Use search to narrow down.</p>}
    </section>
  );
}

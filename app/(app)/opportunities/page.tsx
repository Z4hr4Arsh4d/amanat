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
  const tabCls = (on: boolean) => `rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 ${on ? "bg-emerald-800 text-white" : "border border-stone-300 bg-white"}`;
  const stages = pipeline?.stages ?? [];
  const canEdit = can(ctx, "crm.edit");

  return (
    <section className="space-y-4">
      <AutoRefresh />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={ui.h1}>Opportunities</h1>
          <p className={ui.muted}>Deals moving through your pipeline.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={tab("list")} className={tabCls(view === "list")} aria-current={view === "list" ? "page" : undefined}>☰ List</Link>
          <Link href={tab("board")} className={tabCls(view === "board")} aria-current={view === "board" ? "page" : undefined}>▦ Board</Link>
          {can(ctx, "crm.export") && <a href="/api/export/opportunities" className={ui.btn} download>⬇ Export CSV</a>}
        </div>
      </div>

      {pipelines.length > 1 && (
        <nav aria-label="Pipelines" className="flex flex-wrap gap-2">
          {pipelines.map((p) => (
            <Link key={p.id} href={`/opportunities?${new URLSearchParams({ view, pipeline: p.id }).toString()}`} className={tabCls(p.id === pipeline?.id)}>
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      {can(ctx, "crm.create") && (
        <details className={ui.card}>
          <summary className="cursor-pointer font-medium">＋ New opportunity</summary>
          <div className="mt-3"><OpportunityCreateForm contacts={contacts} pipelines={pipelines} defs={oppDefs} team={team} /></div>
        </details>
      )}

      <FilterBar entity="opportunity" />
      <SearchBox q={q} placeholder="Search by title or contact" hidden={{ view, ...(pipeline ? { pipeline: pipeline.id } : {}) }} />
      {stageFilter && <p className="text-sm">Filtered by stage · <Link href={tab(view).replace(/&?stage=[^&]*/, "")} className="underline">clear</Link></p>}

      {view === "board" ? (
        <Board
          stages={stages}
          items={items.map((o) => ({ id: o.id, title: o.title, contactName: o.contactName, money: formatMoney(o.value, o.currency, o.valueMasked), stageId: o.stageId, version: o.version }))}
          canEdit={canEdit}
        />
      ) : items.length === 0 ? (
        <p className={ui.muted}>No opportunities found.</p>
      ) : (
        <div className={`${ui.card} p-0`}>
          <div className="hidden grid-cols-5 gap-3 border-b border-stone-200 px-4 py-2 text-xs font-semibold uppercase text-stone-600 md:grid">
            <span>Title</span><span>Contact</span><span>Stage</span><span>Value</span><span>Owner</span>
          </div>
          <ul className="divide-y divide-stone-200">
            {items.map((o) => (
              <li key={o.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-5 md:gap-3">
                <Link href={`/opportunities/${o.id}`} className="min-w-0 break-words font-medium text-emerald-800 underline">{o.title}</Link>
                <span className="min-w-0 break-words"><span className="text-stone-500 md:hidden">Contact: </span>{o.contactName}</span>
                <span><span className="text-stone-500 md:hidden">Stage: </span>{o.stageKind === "WON" ? "🏆" : o.stageKind === "LOST" ? "✗" : "●"} {o.stageName}</span>
                <span><span className="text-stone-500 md:hidden">Value: </span>{formatMoney(o.value, o.currency, o.valueMasked)}</span>
                <span className="min-w-0 break-words"><span className="text-stone-500 md:hidden">Owner: </span>{o.ownerId ? names.get(o.ownerId) ?? "—" : "—"}</span>
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

// P1 owns. F2.1 companies list.
import type { Prisma } from "@prisma/client";
import { requireUserPage, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NoAccess } from "@/components/ui/NoAccess";
import { Pagination } from "@/components/ui/Pagination";
import { SearchBox } from "@/components/ui/SearchBox";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { ui } from "@/components/ui/styles";
import { activeFields } from "@/lib/crm/fields";
import { PAGE_SIZE, pageFrom, qFrom } from "@/lib/crm/people";
import { CompaniesClient } from "./CompaniesClient";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireUserPage();
  if (!can(ctx, "crm.view")) return <NoAccess what="view companies" />;
  const sp = await searchParams;
  const q = qFrom(sp.q);
  const page = pageFrom(sp.page);
  const db = scoped(ctx);
  const where: Prisma.CompanyWhereInput = { deletedAt: null, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) };
  const [total, rows, defs] = await Promise.all([
    db.company.count({ where }),
    db.company.findMany({
      where, orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, name: true, version: true, customFields: true, _count: { select: { contacts: { where: { deletedAt: null } } } } },
    }),
    activeFields(db, "COMPANY"),
  ]);
  return (
    <section className="space-y-4">
      <AutoRefresh />
      <div>
        <h1 className={ui.h1}>Companies</h1>
        <p className={ui.muted}>Businesses your contacts belong to.</p>
      </div>
      <SearchBox q={q} placeholder="Search companies by name" />
      <CompaniesClient
        rows={rows.map((r) => ({ id: r.id, name: r.name, version: r.version, contacts: r._count.contacts, customFields: (r.customFields ?? {}) as Record<string, unknown> }))}
        defs={defs}
        perms={{ create: can(ctx, "crm.create"), edit: can(ctx, "crm.edit"), del: can(ctx, "crm.delete") }}
      />
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/companies" params={q ? { q } : {}} />
    </section>
  );
}

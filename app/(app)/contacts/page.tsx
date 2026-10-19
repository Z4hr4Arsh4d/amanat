// P1 owns. F2.1 contacts list, Q9 search + pagination (25 per page).
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
import { AddSummary, Avatar, Badge, EmptyState, PageHeader } from "@/components/ui/Kit";
import { FilterBar } from "@/components/slots/FilterBar";
import { activeFields } from "@/lib/crm/fields";
import { PAGE_SIZE, nameMap, pageFrom, qFrom, teamOptions } from "@/lib/crm/people";
import { ContactForm } from "./ContactForm";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireUserPage();
  if (!can(ctx, "crm.view")) return <NoAccess what="view contacts" />;
  const sp = await searchParams;
  const q = qFrom(sp.q);
  const companyId = qFrom(sp.company);
  const page = pageFrom(sp.page);
  const db = scoped(ctx);
  const digits = q.replace(/\D/g, "").replace(/^0+/, "");
  const where: Prisma.ContactWhereInput = {
    deletedAt: null,
    ...(companyId ? { companyId } : {}),
    ...(q ? {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    } : {}),
  };
  const [total, rows, team, companies, defs] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, name: true, email: true, phone: true, ownerId: true, optedOut: true, tags: true, company: { select: { name: true } } },
    }),
    teamOptions(db),
    db.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true } }),
    activeFields(db, "CONTACT"),
  ]);
  const names = nameMap(team);
  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (companyId) params.company = companyId;
  const companyName = companyId ? companies.find((c) => c.id === companyId)?.name : null;

  const owner = (id: string | null) => (id ? names.get(id) ?? "—" : "—");

  return (
    <section className="space-y-6">
      <AutoRefresh />
      <PageHeader
        title="Contacts"
        description={companyName ? <>Contacts at <strong className="text-stone-900">{companyName}</strong> · <Link href="/contacts" className={ui.link}>Show all contacts</Link></> : "Everyone you sell to."}
        actions={can(ctx, "crm.export") && (
          <a href={`/api/export/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={ui.btn} download>
            <Icon name="download" className="h-4 w-4" /> Export CSV
          </a>
        )}
      />

      {can(ctx, "crm.create") && (
        <details className={ui.cardFlush}>
          <AddSummary>New contact</AddSummary>
          <div className="border-t border-stone-200 p-5">
            <ContactForm defs={defs} companies={companies} team={team} />
          </div>
        </details>
      )}

      <div className="space-y-3">
        <FilterBar entity="contact" />
        <SearchBox q={q} placeholder="Search by name, phone or email" hidden={companyId ? { company: companyId } : {}} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="users" title={q ? `No contacts match “${q}”` : "No contacts yet"}>
          {q ? "Check the spelling, or search by phone number or email instead." : "Contacts are added automatically when leads arrive, or you can add one above."}
        </EmptyState>
      ) : (
        <div className={ui.cardFlush}>
          <table className="hidden w-full text-sm md:table">
            <caption className="sr-only">Contacts</caption>
            <thead className="border-b border-stone-200 bg-stone-50/70">
              <tr>
                <th scope="col" className={ui.th}>Name</th>
                <th scope="col" className={ui.th}>Company</th>
                <th scope="col" className={ui.th}>Phone</th>
                <th scope="col" className={ui.th}>Email</th>
                <th scope="col" className={ui.th}>Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((c) => (
                <tr key={c.id} className={ui.row}>
                  <td className="max-w-[16rem] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} size="sm" />
                      <div className="min-w-0">
                        <Link href={`/contacts/${c.id}`} className="block truncate font-semibold text-stone-900 hover:text-emerald-800 hover:underline">{c.name}</Link>
                        {c.tags.length > 0 && <span className="block truncate text-xs text-stone-500">{c.tags.map((t) => `#${t}`).join(" ")}</span>}
                      </div>
                      {c.optedOut && <Badge tone="bad" icon="ban">Opted out</Badge>}
                    </div>
                  </td>
                  <td className="max-w-[12rem] truncate px-4 py-3 text-stone-700">{c.company?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-stone-700">{c.phone ?? "—"}</td>
                  <td className="max-w-[14rem] truncate px-4 py-3 text-stone-700">{c.email ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-700">{owner(c.ownerId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-stone-100 md:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/contacts/${c.id}`} className="flex items-start gap-3 px-4 py-3.5 hover:bg-stone-50">
                  <Avatar name={c.name} size="sm" />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-stone-900">{c.name}</span>
                      {c.optedOut && <Badge tone="bad" icon="ban">Opted out</Badge>}
                    </span>
                    <span className="mt-0.5 block break-words text-stone-600">{[c.company?.name, c.phone, c.email].filter(Boolean).join(" · ") || "No details yet"}</span>
                    <span className="mt-0.5 block text-xs text-stone-500">Owner: {owner(c.ownerId)}</span>
                  </span>
                  <Icon name="chevronRight" className="mt-1 h-4 w-4 text-stone-400" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/contacts" params={params} />
    </section>
  );
}

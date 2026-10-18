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

  return (
    <section className="space-y-4">
      <AutoRefresh />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={ui.h1}>Contacts</h1>
          <p className={ui.muted}>
            {companyName ? <>Contacts at <strong>{companyName}</strong> · <Link href="/contacts" className="underline">show all</Link></> : "Everyone you sell to."}
          </p>
        </div>
        {can(ctx, "crm.export") && (
          <a href={`/api/export/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={ui.btn} download>⬇ Export CSV</a>
        )}
      </div>

      {can(ctx, "crm.create") && (
        <details className={ui.card}>
          <summary className="cursor-pointer font-medium">＋ New contact</summary>
          <div className="mt-3">
            <ContactForm defs={defs} companies={companies} team={team} />
          </div>
        </details>
      )}

      <FilterBar entity="contact" />
      <SearchBox q={q} placeholder="Search by name, phone or email" hidden={companyId ? { company: companyId } : {}} />

      {rows.length === 0 ? (
        <p className={ui.muted}>No contacts found.</p>
      ) : (
        <div className={`${ui.card} p-0`}>
          <div className="hidden grid-cols-5 gap-3 border-b border-stone-200 px-4 py-2 text-xs font-semibold uppercase text-stone-600 md:grid">
            <span>Name</span><span>Company</span><span>Phone</span><span>Email</span><span>Owner</span>
          </div>
          <ul className="divide-y divide-stone-200">
            {rows.map((c) => (
              <li key={c.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-5 md:gap-3">
                <span className="min-w-0 break-words">
                  <Link href={`/contacts/${c.id}`} className="font-medium text-emerald-800 underline">{c.name}</Link>
                  {c.optedOut && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">⊘ Opted out</span>}
                  {c.tags.length > 0 && <span className="block text-xs text-stone-500">{c.tags.map((t) => `#${t}`).join(" ")}</span>}
                </span>
                <span className="min-w-0 break-words"><span className="text-stone-500 md:hidden">Company: </span>{c.company?.name ?? "—"}</span>
                <span className="min-w-0 break-all"><span className="text-stone-500 md:hidden">Phone: </span>{c.phone ?? "—"}</span>
                <span className="min-w-0 break-all"><span className="text-stone-500 md:hidden">Email: </span>{c.email ?? "—"}</span>
                <span className="min-w-0 break-words"><span className="text-stone-500 md:hidden">Owner: </span>{c.ownerId ? names.get(c.ownerId) ?? "—" : "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/contacts" params={params} />
    </section>
  );
}

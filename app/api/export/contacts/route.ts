// P1 owns. F1.4 export: needs crm.export, recorded in the audit log.
import type { Prisma } from "@prisma/client";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { handler } from "@/lib/core/errors";
import { activeFields } from "@/lib/crm/fields";
import { csvResponse, toCsv } from "@/lib/crm/csv";
import { auditAs } from "@/lib/crm/log";

export const GET = handler(async (req: Request) => {
  const ctx = await requireUser();
  requirePermission(ctx, "crm.export");
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  const db = scoped(ctx);
  const where: Prisma.ContactWhereInput = {
    deletedAt: null,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, defs, users] = await Promise.all([
    db.contact.findMany({ where, orderBy: { name: "asc" }, take: 20000, include: { company: { select: { name: true } } } }),
    activeFields(db, "CONTACT"),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const header = ["Name", "Phone", "Email", "Company", "Owner", "Tags", "Opted out", "Created", ...defs.map((d) => d.label)];
  const data = rows.map((c) => {
    const cf = (c.customFields ?? {}) as Record<string, unknown>;
    return [
      c.name, c.phone, c.email, c.company?.name ?? "", c.ownerId ? names.get(c.ownerId) ?? "" : "", c.tags.join(" "),
      c.optedOut ? "Yes" : "No", c.createdAt.toISOString(), ...defs.map((d) => cf[d.key]),
    ];
  });
  await auditAs(ctx, "export", "Contact", null, null, { entity: "contacts", count: rows.length, search: q || null });
  return csvResponse("contacts", toCsv(header, data));
});

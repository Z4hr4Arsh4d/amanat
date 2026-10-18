// P1 owns. GET /api/contacts?q=&page= — paginated (25), workspace-scoped, needs crm.view.
import type { Prisma } from "@prisma/client";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { handler } from "@/lib/core/errors";
import { PAGE_SIZE, pageFrom, qFrom } from "@/lib/crm/people";

export const GET = handler(async (req: Request) => {
  const ctx = await requireUser();
  requirePermission(ctx, "crm.view");
  const sp = new URL(req.url).searchParams;
  const q = qFrom(sp.get("q") ?? undefined);
  const page = pageFrom(sp.get("page") ?? undefined);
  const digits = q.replace(/\D/g, "").replace(/^0+/, "");
  const where: Prisma.ContactWhereInput = {
    deletedAt: null,
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ] } : {}),
  };
  const db = scoped(ctx);
  const [total, items] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, name: true, phone: true, email: true, companyId: true, ownerId: true, tags: true, optedOut: true, version: true },
    }),
  ]);
  return Response.json({ items, total, page, pageSize: PAGE_SIZE });
});

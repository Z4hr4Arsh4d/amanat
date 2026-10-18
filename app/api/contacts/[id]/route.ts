// P1 owns. GET / DELETE one contact. Another workspace's id → 404 (F1.6). DELETE needs crm.delete → else 403 (F1.5).
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NotFound, handler } from "@/lib/core/errors";
import { softDeleteContact } from "@/lib/crm/contacts";

type P = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: P) => {
  const ctx = await requireUser();
  requirePermission(ctx, "crm.view");
  const { id } = await params;
  const c = await scoped(ctx).contact.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, phone: true, email: true, companyId: true, ownerId: true, tags: true, optedOut: true, customFields: true, version: true },
  });
  if (!c) throw NotFound();
  return Response.json(c);
});

export const DELETE = handler(async (_req: Request, { params }: P) => {
  const ctx = await requireUser();
  requirePermission(ctx, "crm.delete");
  const { id } = await params;
  const r = await softDeleteContact(ctx, id, null);
  return Response.json({ ok: true, ...r });
});

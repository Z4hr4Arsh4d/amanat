// P1 owns. GET one opportunity. The value is masked for people without opportunity.value.view (F1.4).
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NotFound, handler } from "@/lib/core/errors";
import { serializeOpportunity } from "@/lib/crm/serialize";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireUser();
  requirePermission(ctx, "crm.view");
  const { id } = await params;
  const o = await scoped(ctx).opportunity.findFirst({ where: { id, deletedAt: null, contact: { deletedAt: null } } });
  if (!o) throw NotFound();
  return Response.json(serializeOpportunity(o, ctx));
});

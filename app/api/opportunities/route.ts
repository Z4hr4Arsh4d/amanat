// P1 owns. GET /api/opportunities?page= — paginated, workspace-scoped, values masked per F1.4.
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { handler } from "@/lib/core/errors";
import { PAGE_SIZE, pageFrom } from "@/lib/crm/people";
import { serializeOpportunity } from "@/lib/crm/serialize";

export const GET = handler(async (req: Request) => {
  const ctx = await requireUser();
  requirePermission(ctx, "crm.view");
  const page = pageFrom(new URL(req.url).searchParams.get("page") ?? undefined);
  const where = { deletedAt: null, contact: { deletedAt: null } };
  const db = scoped(ctx);
  const [total, rows] = await Promise.all([
    db.opportunity.count({ where }),
    db.opportunity.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return Response.json({ items: rows.map((o) => serializeOpportunity(o, ctx)), total, page, pageSize: PAGE_SIZE });
});

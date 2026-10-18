// P3 owns. Sync history query (I5.4). Readable with integrations.manage or audit.view.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { can, scoped, type Ctx } from "@/lib/shared/contracts";
import { Forbidden } from "@/lib/core/errors";

export const HistoryQuery = z.object({
  provider: z.enum(["TWILIO", "STRIPE", "GOOGLE", "TELEGRAM", "META", "WEBCHAT"]).optional().catch(undefined),
  direction: z.enum(["IN", "OUT"]).optional().catch(undefined),
  status: z.enum(["RECEIVED", "PROCESSED", "REJECTED", "FAILED", "RETRYING", "SENT"]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
export const PAGE_SIZE = 25;

export function canSeeHistory(ctx: Ctx) {
  return can(ctx, "integrations.manage") || can(ctx, "audit.view");
}

export async function listEvents(ctx: Ctx, raw: Record<string, string | undefined>) {
  if (!canSeeHistory(ctx)) throw Forbidden("view the sync history");
  const f = HistoryQuery.parse(raw);
  const where: Prisma.IntegrationEventWhereInput = {
    ...(f.provider ? { provider: f.provider } : {}),
    ...(f.direction ? { direction: f.direction } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.q ? { OR: [{ externalId: { contains: f.q, mode: "insensitive" } }, { type: { contains: f.q, mode: "insensitive" } }, { error: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const db = scoped(ctx);
  const [items, total] = await Promise.all([
    db.integrationEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.integrationEvent.count({ where }),
  ]);
  return { items, total, page: f.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

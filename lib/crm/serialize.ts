// P1 owns. F1.4 field masking. EVERY opportunity that leaves the server (list, detail, export, board)
// goes through serializeOpportunity so the value is hidden from people without opportunity.value.view.
import type { Prisma } from "@prisma/client";
import { can, type Ctx } from "@/lib/core/session";

export const MASK = "•••••";

type OppIn = {
  id: string; title: string; value: Prisma.Decimal | number | string; currency: string;
  pipelineId: string; stageId: string; contactId: string; ownerId: string | null; version: number;
  customFields: Prisma.JsonValue; createdAt: Date; closedAt: Date | null;
};

export function serializeOpportunity<T extends OppIn>(o: T, ctx: Ctx) {
  const show = can(ctx, "opportunity.value.view");
  return {
    id: o.id, title: o.title, currency: o.currency, pipelineId: o.pipelineId, stageId: o.stageId,
    contactId: o.contactId, ownerId: o.ownerId, version: o.version,
    customFields: (o.customFields ?? {}) as Record<string, unknown>,
    createdAt: o.createdAt.toISOString(), closedAt: o.closedAt ? o.closedAt.toISOString() : null,
    value: show ? Number(o.value.toString()) : null,
    valueMasked: !show,
  };
}
export type SerializedOpportunity = ReturnType<typeof serializeOpportunity>;

export function formatMoney(value: number | null, currency: string, masked: boolean) {
  if (masked || value === null) return MASK;
  return `${currency} ${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

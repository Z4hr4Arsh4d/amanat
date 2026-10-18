// P1 owns. F1.4: values go through serializeOpportunity, so people without opportunity.value.view get "hidden".
import { requireUser, requirePermission, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { handler } from "@/lib/core/errors";
import { allOpportunityFields } from "@/lib/crm/pipelines";
import { serializeOpportunity } from "@/lib/crm/serialize";
import { csvResponse, toCsv } from "@/lib/crm/csv";
import { auditAs } from "@/lib/crm/log";

export const GET = handler(async () => {
  const ctx = await requireUser();
  requirePermission(ctx, "crm.export");
  const db = scoped(ctx);
  const [rows, defs, users] = await Promise.all([
    db.opportunity.findMany({
      where: { deletedAt: null, contact: { deletedAt: null } }, orderBy: { createdAt: "desc" }, take: 20000,
      include: { contact: { select: { name: true } }, pipeline: { select: { name: true } }, stage: { select: { name: true } } },
    }),
    allOpportunityFields(db),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const header = ["Title", "Contact", "Pipeline", "Stage", "Value", "Currency", "Owner", "Created", "Closed", ...defs.map((d) => d.label)];
  const data = rows.map((o) => {
    const s = serializeOpportunity(o, ctx);
    return [
      o.title, o.contact.name, o.pipeline.name, o.stage.name, s.valueMasked ? "hidden" : s.value, o.currency,
      o.ownerId ? names.get(o.ownerId) ?? "" : "", s.createdAt, s.closedAt ?? "",
      ...defs.map((d) => (d.pipelineId && d.pipelineId !== o.pipelineId ? "" : s.customFields[d.key])),
    ];
  });
  await auditAs(ctx, "export", "Opportunity", null, null, { entity: "opportunities", count: rows.length, valuesMasked: !can(ctx, "opportunity.value.view") });
  return csvResponse("opportunities", toCsv(header, data));
});

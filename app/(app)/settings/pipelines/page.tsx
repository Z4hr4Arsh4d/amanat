// P1 owns. F2.4 / F2.5.
import { requireUserPage, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NoAccess } from "@/components/ui/NoAccess";
import { ui } from "@/components/ui/styles";
import { allOpportunityFields, pipelinesWithStages } from "@/lib/crm/pipelines";
import { PipelinesClient } from "./PipelinesClient";

export default async function PipelinesPage() {
  const ctx = await requireUserPage();
  if (!can(ctx, "pipeline.configure")) return <NoAccess what="configure pipelines" />;
  const db = scoped(ctx);
  const [pipelines, fields, counts] = await Promise.all([
    pipelinesWithStages(db),
    allOpportunityFields(db),
    db.opportunity.groupBy({ by: ["stageId"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const byStage = Object.fromEntries(counts.map((c) => [c.stageId, c._count._all]));
  return (
    <section className="space-y-6">
      <div>
        <h1 className={ui.h1}>Pipelines</h1>
        <p className={ui.muted}>
          Stages run top to bottom. Mark the stages that close a deal as Won or Lost. Tick the fields that must be filled before
          an opportunity can enter a stage.
        </p>
      </div>
      <PipelinesClient pipelines={pipelines} fields={fields} counts={byStage} />
    </section>
  );
}

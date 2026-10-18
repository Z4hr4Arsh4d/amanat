// P1 owns.
import type { scoped } from "@/lib/core/scoped";

export type PipelineView = {
  id: string; name: string; isDefault: boolean;
  stages: { id: string; name: string; kind: "OPEN" | "WON" | "LOST"; order: number; requiredFieldIds: string[] }[];
};

export async function pipelinesWithStages(db: ReturnType<typeof scoped>): Promise<PipelineView[]> {
  const rows = await db.pipeline.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, isDefault: true,
      stages: { orderBy: { order: "asc" }, select: { id: true, name: true, kind: true, order: true, requiredFieldIds: true } },
    },
  });
  return rows;
}

/** All active opportunity field definitions (client filters them by pipeline). */
export async function allOpportunityFields(db: ReturnType<typeof scoped>) {
  return db.fieldDef.findMany({
    where: { entity: "OPPORTUNITY", deletedAt: null },
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: { id: true, key: true, label: true, type: true, options: true, pipelineId: true },
  });
}

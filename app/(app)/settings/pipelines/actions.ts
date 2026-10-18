"use server";
// P1 owns. F2.4 pipelines & stages, F2.5 required fields per stage. Deleting a stage that holds
// opportunities moves them and deletes the stage in ONE transaction (+ audit).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { HttpError, NotFound } from "@/lib/core/errors";
import { auditAs } from "@/lib/crm/log";
import { Id } from "@/lib/crm/schemas";

const Name = z.string().trim().min(1, "Enter a name").max(60, "Name must be 60 characters or fewer");
const Kind = z.enum(["OPEN", "WON", "LOST"], "Choose Open, Won or Lost");

async function guard() {
  const ctx = await requireUser();
  requirePermission(ctx, "pipeline.configure");
  return { ctx, db: scoped(ctx) };
}
function refresh() {
  revalidatePath("/settings/pipelines");
  revalidatePath("/settings/fields");
  revalidatePath("/opportunities", "layout");
}

// ───────────── Pipelines ─────────────

export async function createPipeline(input: { name: string }) {
  return act(async () => {
    const { ctx, db } = await guard();
    const name = Name.parse(input.name);
    if (await db.pipeline.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) {
      throw new HttpError(409, `A pipeline called "${name}" already exists.`);
    }
    const hasDefault = !!(await db.pipeline.findFirst({ where: { isDefault: true } }));
    const p = await db.$transaction(async (tx) => {
      const pipe = await tx.pipeline.create({ data: { workspaceId: ctx.workspaceId, name, isDefault: !hasDefault } });
      const stages: [string, "OPEN" | "WON" | "LOST"][] = [["New", "OPEN"], ["Won", "WON"], ["Lost", "LOST"]];
      await tx.stage.createMany({ data: stages.map(([n, kind], order) => ({ workspaceId: ctx.workspaceId, pipelineId: pipe.id, name: n, kind, order })) });
      return pipe;
    });
    await auditAs(ctx, "pipeline.created", "Pipeline", p.id, null, { name });
    refresh();
    return { id: p.id };
  });
}

export async function renamePipeline(input: { pipelineId: string; name: string }) {
  return act(async () => {
    const { ctx, db } = await guard();
    const data = z.object({ pipelineId: Id, name: Name }).parse(input);
    const p = await db.pipeline.findFirst({ where: { id: data.pipelineId } });
    if (!p) throw NotFound();
    if (p.name === data.name) return null;
    if (await db.pipeline.findFirst({ where: { name: { equals: data.name, mode: "insensitive" }, NOT: { id: p.id } } })) {
      throw new HttpError(409, `A pipeline called "${data.name}" already exists.`);
    }
    await db.pipeline.update({ where: { id: p.id }, data: { name: data.name } });
    await auditAs(ctx, "pipeline.renamed", "Pipeline", p.id, { name: p.name }, { name: data.name });
    refresh();
    return null;
  });
}

export async function makeDefaultPipeline(input: { pipelineId: string }) {
  return act(async () => {
    const { ctx, db } = await guard();
    const pipelineId = Id.parse(input.pipelineId);
    const p = await db.pipeline.findFirst({ where: { id: pipelineId } });
    if (!p) throw NotFound();
    await db.$transaction([
      db.pipeline.updateMany({ where: { NOT: { id: p.id } }, data: { isDefault: false } }),
      db.pipeline.update({ where: { id: p.id }, data: { isDefault: true } }),
    ]);
    await auditAs(ctx, "pipeline.default_changed", "Pipeline", p.id, null, { name: p.name });
    refresh();
    return null;
  });
}

export async function deletePipeline(input: { pipelineId: string }) {
  return act(async () => {
    const { ctx, db } = await guard();
    const pipelineId = Id.parse(input.pipelineId);
    const p = await db.pipeline.findFirst({ where: { id: pipelineId } });
    if (!p) throw NotFound();
    if (p.isDefault) throw new HttpError(409, "This is the default pipeline. Make another pipeline the default first.");
    const live = await db.opportunity.count({ where: { pipelineId: p.id, deletedAt: null } });
    if (live > 0) throw new HttpError(409, `"${p.name}" still has ${live} opportunit${live === 1 ? "y" : "ies"}. Move or delete them first.`);
    const history = await db.opportunity.count({ where: { pipelineId: p.id } });
    if (history > 0) throw new HttpError(409, `"${p.name}" keeps the history of ${history} deleted opportunit${history === 1 ? "y" : "ies"}, so it can't be deleted. Rename it instead.`);
    await db.pipeline.delete({ where: { id: p.id } }); // stages + its own fields cascade
    await auditAs(ctx, "pipeline.deleted", "Pipeline", p.id, { name: p.name }, null);
    refresh();
    return null;
  });
}

// ───────────── Stages ─────────────

export async function addStage(input: { pipelineId: string; name: string; kind: string }) {
  return act(async () => {
    const { ctx, db } = await guard();
    const data = z.object({ pipelineId: Id, name: Name, kind: Kind }).parse(input);
    const p = await db.pipeline.findFirst({ where: { id: data.pipelineId } });
    if (!p) throw NotFound();
    if (await db.stage.findFirst({ where: { pipelineId: p.id, name: { equals: data.name, mode: "insensitive" } } })) {
      throw new HttpError(409, `"${p.name}" already has a stage called "${data.name}".`);
    }
    // New OPEN stages go before the first Won/Lost stage; Won/Lost stages go at the end.
    const stages = await db.stage.findMany({ where: { pipelineId: p.id }, orderBy: { order: "asc" }, select: { id: true, kind: true } });
    const firstClosed = stages.findIndex((s) => s.kind !== "OPEN");
    const at = data.kind === "OPEN" && firstClosed >= 0 ? firstClosed : stages.length;
    const s = await db.$transaction(async (tx) => {
      for (let i = stages.length - 1; i >= at; i--) await tx.stage.update({ where: { id: stages[i].id }, data: { order: i + 1 } });
      return tx.stage.create({ data: { workspaceId: ctx.workspaceId, pipelineId: p.id, name: data.name, kind: data.kind, order: at } });
    });
    await auditAs(ctx, "stage.created", "Stage", s.id, null, { pipeline: p.name, name: data.name, kind: data.kind, position: at + 1 });
    refresh();
    return null;
  });
}

export async function updateStage(input: { stageId: string; name: string; kind: string; requiredFieldIds: string[] }) {
  return act(async () => {
    const { ctx, db } = await guard();
    const data = z.object({ stageId: Id, name: Name, kind: Kind, requiredFieldIds: z.array(Id).max(100) }).parse(input);
    const s = await db.stage.findFirst({ where: { id: data.stageId }, include: { pipeline: { select: { name: true } } } });
    if (!s) throw NotFound();
    if (data.name !== s.name && (await db.stage.findFirst({ where: { pipelineId: s.pipelineId, name: { equals: data.name, mode: "insensitive" }, NOT: { id: s.id } } }))) {
      throw new HttpError(409, `This pipeline already has a stage called "${data.name}".`);
    }
    const required = [...new Set(data.requiredFieldIds)];
    if (required.length) {
      const ok = await db.fieldDef.count({
        where: { id: { in: required }, entity: "OPPORTUNITY", deletedAt: null, OR: [{ pipelineId: null }, { pipelineId: s.pipelineId }] },
      });
      if (ok !== required.length) throw new HttpError(422, "One of the required fields doesn't belong to this pipeline. Reload and try again.");
    }
    await db.stage.update({ where: { id: s.id }, data: { name: data.name, kind: data.kind, requiredFieldIds: required } });
    const before = { name: s.name, kind: s.kind, requiredFieldIds: [...s.requiredFieldIds].sort() };
    const after = { name: data.name, kind: data.kind, requiredFieldIds: [...required].sort() };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const action = s.name !== data.name ? "stage.renamed" : "stage.updated";
      await auditAs(ctx, action, "Stage", s.id, { pipeline: s.pipeline.name, ...before }, { pipeline: s.pipeline.name, ...after });
    }
    refresh();
    return null;
  });
}

export async function moveStageOrder(input: { stageId: string; direction: "up" | "down" }) {
  return act(async () => {
    const { ctx, db } = await guard();
    const data = z.object({ stageId: Id, direction: z.enum(["up", "down"]) }).parse(input);
    const s = await db.stage.findFirst({ where: { id: data.stageId } });
    if (!s) throw NotFound();
    const list = await db.stage.findMany({ where: { pipelineId: s.pipelineId }, orderBy: { order: "asc" }, select: { id: true, name: true } });
    const i = list.findIndex((x) => x.id === s.id);
    const j = data.direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return null;
    const before = list.map((x) => x.name);
    [list[i], list[j]] = [list[j], list[i]];
    await db.$transaction(list.map((x, idx) => db.stage.update({ where: { id: x.id }, data: { order: idx } })));
    await auditAs(ctx, "stage.reordered", "Pipeline", s.pipelineId, { order: before }, { order: list.map((x) => x.name) });
    refresh();
    return null;
  });
}

/** If the stage holds opportunities, moveToStageId is required: move + delete happen in one transaction. */
export async function deleteStage(input: { stageId: string; moveToStageId?: string | null }) {
  return act(async () => {
    const { ctx, db } = await guard();
    const data = z.object({ stageId: Id, moveToStageId: Id.nullable().optional() }).parse(input);
    const s = await db.stage.findFirst({ where: { id: data.stageId }, include: { pipeline: { select: { name: true } } } });
    if (!s) throw NotFound();
    const siblings = await db.stage.findMany({ where: { pipelineId: s.pipelineId }, orderBy: { order: "asc" }, select: { id: true, name: true, kind: true } });
    if (siblings.length <= 1) throw new HttpError(409, "A pipeline needs at least one stage. Add another stage before deleting this one.");
    const live = await db.opportunity.count({ where: { stageId: s.id, deletedAt: null } });
    const all = await db.opportunity.count({ where: { stageId: s.id } }); // deleted ones still point at the stage
    let target: { id: string; name: string; kind: string } | undefined;
    if (all > 0) {
      if (!data.moveToStageId) {
        throw new HttpError(409, `This stage has ${live} opportunit${live === 1 ? "y" : "ies"}. Choose a stage to move them to.`, { count: live });
      }
      target = siblings.find((x) => x.id === data.moveToStageId && x.id !== s.id);
      if (!target) throw new HttpError(422, "Choose another stage in the same pipeline to move them to.");
    }
    const t = target;
    await db.$transaction(async (tx) => {
      if (t) {
        await tx.opportunity.updateMany({
          where: { stageId: s.id, workspaceId: ctx.workspaceId },
          data: { stageId: t.id, closedAt: t.kind === "OPEN" ? null : new Date(), version: { increment: 1 } },
        });
      }
      await tx.stage.delete({ where: { id: s.id } });
      const rest = siblings.filter((x) => x.id !== s.id);
      for (let i = 0; i < rest.length; i++) await tx.stage.update({ where: { id: rest[i].id }, data: { order: i } });
    });
    await auditAs(ctx, "stage.deleted", "Stage", s.id,
      { pipeline: s.pipeline.name, name: s.name, kind: s.kind },
      t ? { movedOpportunities: live, movedTo: t.name } : null);
    refresh();
    return { moved: live };
  });
}

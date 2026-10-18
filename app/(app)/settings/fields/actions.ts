"use server";
// P1 owns. F2.2 custom fields: add, edit label/options, reorder, delete (soft — stored values are kept, just hidden).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { HttpError, NotFound } from "@/lib/core/errors";
import { auditAs } from "@/lib/crm/log";
import { Id } from "@/lib/crm/schemas";

const Entity = z.enum(["CONTACT", "COMPANY", "OPPORTUNITY"], "Choose what the field belongs to");
const Type = z.enum(["TEXT", "NUMBER", "DATE", "DROPDOWN", "CHECKBOX"], "Choose a field type");
const Label = z.string().trim().min(1, "Enter a label").max(60, "Label must be 60 characters or fewer");
const Options = z.array(z.string().trim().min(1).max(60, "Each option must be 60 characters or fewer")).max(50, "Use 50 options or fewer");

function cleanOptions(type: string, options: string[] | undefined) {
  if (type !== "DROPDOWN") return [];
  const opts = [...new Set((options ?? []).map((o) => o.trim()).filter(Boolean))];
  if (opts.length < 1) throw new HttpError(422, "A dropdown needs at least one option.");
  return opts;
}

function revalidateAll() {
  revalidatePath("/settings/fields");
  revalidatePath("/settings/pipelines");
  revalidatePath("/contacts", "layout");
  revalidatePath("/companies");
  revalidatePath("/opportunities", "layout");
}

export async function createField(input: { entity: string; label: string; type: string; options?: string[]; pipelineId?: string | null }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "pipeline.configure");
    const data = z.object({ entity: Entity, label: Label, type: Type, options: Options.optional(), pipelineId: Id.nullable().optional() }).parse(input);
    const db = scoped(ctx);
    const pipelineId = data.entity === "OPPORTUNITY" ? data.pipelineId ?? null : null;
    if (pipelineId && !(await db.pipeline.findFirst({ where: { id: pipelineId } }))) throw NotFound();
    const options = cleanOptions(data.type, data.options);

    const active = await db.fieldDef.findFirst({
      where: { entity: data.entity, deletedAt: null, label: { equals: data.label, mode: "insensitive" }, pipelineId },
    });
    if (active) throw new HttpError(409, `A field called "${data.label}" already exists here.`);

    // Keys are stable (values are stored by key). Never reuse a deleted field's key.
    const base = data.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
    const taken = new Set((await db.fieldDef.findMany({ where: { entity: data.entity, key: { startsWith: base } }, select: { key: true } })).map((f) => f.key));
    let key = base;
    for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

    const last = await db.fieldDef.findFirst({ where: { entity: data.entity, pipelineId, deletedAt: null }, orderBy: { order: "desc" }, select: { order: true } });
    const f = await db.fieldDef.create({
      data: { workspaceId: ctx.workspaceId, entity: data.entity, label: data.label, type: data.type, options, pipelineId, key, order: (last?.order ?? -1) + 1 },
    });
    await auditAs(ctx, "field.created", "FieldDef", f.id, null, { entity: f.entity, label: f.label, type: f.type, options, pipelineId, key });
    revalidateAll();
    return { id: f.id };
  });
}

export async function updateField(input: { fieldId: string; label: string; options?: string[] }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "pipeline.configure");
    const data = z.object({ fieldId: Id, label: Label, options: Options.optional() }).parse(input);
    const db = scoped(ctx);
    const f = await db.fieldDef.findFirst({ where: { id: data.fieldId, deletedAt: null } });
    if (!f) throw NotFound();
    const options = cleanOptions(f.type, data.options);
    const clash = await db.fieldDef.findFirst({
      where: { entity: f.entity, deletedAt: null, pipelineId: f.pipelineId, label: { equals: data.label, mode: "insensitive" }, NOT: { id: f.id } },
    });
    if (clash) throw new HttpError(409, `A field called "${data.label}" already exists here.`);
    await db.fieldDef.update({ where: { id: f.id }, data: { label: data.label, options } });
    await auditAs(ctx, "field.updated", "FieldDef", f.id, { label: f.label, options: f.options }, { label: data.label, options });
    revalidateAll();
    return null;
  });
}

export async function moveField(input: { fieldId: string; direction: "up" | "down" }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "pipeline.configure");
    const data = z.object({ fieldId: Id, direction: z.enum(["up", "down"]) }).parse(input);
    const db = scoped(ctx);
    const f = await db.fieldDef.findFirst({ where: { id: data.fieldId, deletedAt: null } });
    if (!f) throw NotFound();
    const group = await db.fieldDef.findMany({
      where: { entity: f.entity, pipelineId: f.pipelineId, deletedAt: null },
      orderBy: [{ order: "asc" }, { label: "asc" }], select: { id: true, label: true },
    });
    const i = group.findIndex((g) => g.id === f.id);
    const j = data.direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= group.length) return null;
    [group[i], group[j]] = [group[j], group[i]];
    await db.$transaction(group.map((g, idx) => db.fieldDef.update({ where: { id: g.id }, data: { order: idx } })));
    await auditAs(ctx, "field.updated", "FieldDef", f.id, null, { reordered: group.map((g) => g.label) });
    revalidateAll();
    return null;
  });
}

export async function deleteField(input: { fieldId: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "pipeline.configure");
    const fieldId = Id.parse(input.fieldId);
    const db = scoped(ctx);
    const f = await db.fieldDef.findFirst({ where: { id: fieldId, deletedAt: null } });
    if (!f) throw NotFound();
    const stages = await db.stage.findMany({ where: { requiredFieldIds: { has: f.id } }, select: { id: true, requiredFieldIds: true } });
    await db.$transaction([
      db.fieldDef.update({ where: { id: f.id }, data: { deletedAt: new Date() } }),
      ...stages.map((s) => db.stage.update({ where: { id: s.id }, data: { requiredFieldIds: s.requiredFieldIds.filter((x) => x !== f.id) } })),
    ]);
    await auditAs(ctx, "field.deleted", "FieldDef", f.id, { entity: f.entity, label: f.label, type: f.type, key: f.key }, null);
    revalidateAll();
    return null;
  });
}

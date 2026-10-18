"use server";
// P1 owns. F2.1 opportunities, F2.4 stage moves, F2.5 required fields (422), Q4 versions (409), F1.4 masking.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { Conflict, HttpError, NotFound } from "@/lib/core/errors";
import { activeFields, diffValues, missingRequired, validateCustomFields } from "@/lib/crm/fields";
import { auditAs } from "@/lib/crm/log";
import { CustomIn, Currency, Id, Money, NullableId, Version } from "@/lib/crm/schemas";
import * as timeline from "@/lib/crm/timeline";
import { leads } from "@/lib/shared/contracts";

const Title = z.string().trim().min(1, "Enter a title").max(160, "Title is too long");

function needFieldsError(missing: string[], stageName: string) {
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return new HttpError(422, `Fill ${list} before moving to ${stageName}.`, { missing });
}

export async function createOpportunity(input: {
  contactId: string; pipelineId?: string | null; title: string; value?: number | string; currency?: string;
  ownerId?: string | null; customFields?: Record<string, unknown>;
}) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.create");
    const data = z.object({
      contactId: Id, pipelineId: NullableId, title: Title, value: Money.optional(), currency: Currency.optional(),
      ownerId: NullableId, customFields: CustomIn,
    }).parse(input);
    const db = scoped(ctx);
    const contact = await db.contact.findFirst({ where: { id: data.contactId, deletedAt: null }, select: { id: true, name: true } });
    if (!contact) throw NotFound();
    const pipeline = data.pipelineId
      ? await db.pipeline.findFirst({ where: { id: data.pipelineId } })
      : await db.pipeline.findFirst({ where: { isDefault: true } }) ?? await db.pipeline.findFirst({ orderBy: { name: "asc" } });
    if (!pipeline) throw new HttpError(422, "Create a pipeline first (Settings → Pipelines).");
    const stage = await db.stage.findFirst({ where: { pipelineId: pipeline.id }, orderBy: { order: "asc" } });
    if (!stage) throw new HttpError(422, `The pipeline "${pipeline.name}" has no stages. Add one in Settings → Pipelines.`);
    if (data.ownerId && !(await db.user.findFirst({ where: { id: data.ownerId } }))) throw NotFound();
    const defs = await activeFields(db, "OPPORTUNITY", pipeline.id);
    const custom = validateCustomFields(defs, data.customFields);
    const missing = missingRequired(defs, stage.requiredFieldIds, custom);
    if (missing.length) throw needFieldsError(missing, stage.name);

    const o = await db.opportunity.create({
      data: {
        workspaceId: ctx.workspaceId, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id, title: data.title,
        value: data.value ?? 0, currency: data.currency ?? "PKR", ownerId: data.ownerId ?? ctx.userId, customFields: custom,
      },
    });
    await timeline.add({
      workspaceId: ctx.workspaceId, actorId: ctx.userId, type: "stage_change", contactId: contact.id, opportunityId: o.id,
      summary: `Opportunity "${o.title}" created in ${stage.name}`, data: { to: stage.name },
    });
    revalidatePath("/opportunities");
    revalidatePath(`/contacts/${contact.id}`);
    return { id: o.id };
  });
}

export async function updateOpportunity(input: {
  opportunityId: string; version: number; title: string; value?: number | string; currency: string;
  ownerId?: string | null; customFields?: Record<string, unknown>;
}) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.edit");
    const data = z.object({
      opportunityId: Id, version: Version, title: Title, value: Money.optional(), currency: Currency,
      ownerId: NullableId, customFields: CustomIn,
    }).parse(input);
    const db = scoped(ctx);
    const cur = await db.opportunity.findFirst({ where: { id: data.opportunityId, deletedAt: null } });
    if (!cur) throw NotFound();
    if (data.ownerId && !(await db.user.findFirst({ where: { id: data.ownerId } }))) throw NotFound();
    const canValue = can(ctx, "opportunity.value.view"); // F1.4: can't change what you can't see
    const defs = await activeFields(db, "OPPORTUNITY", cur.pipelineId);
    const custom = validateCustomFields(defs, data.customFields);
    const beforeCf = (cur.customFields ?? {}) as Record<string, unknown>;
    const customFields = { ...beforeCf, ...custom };
    const value = canValue && data.value !== undefined ? data.value : Number(cur.value.toString());

    const r = await db.opportunity.updateMany({
      where: { id: cur.id, version: data.version, deletedAt: null },
      data: { title: data.title, value, currency: data.currency, ownerId: data.ownerId ?? null, customFields, version: { increment: 1 } },
    });
    if (r.count === 0) throw Conflict();

    const labels: Record<string, string> = { title: "Title", currency: "Currency", owner: "Owner" };
    if (canValue) labels.value = "Value";
    for (const d of defs) labels[`cf.${d.key}`] = d.label;
    const owners = await db.user.findMany({ where: { id: { in: [cur.ownerId, data.ownerId].filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const ownerName = (id: string | null | undefined) => (id ? owners.find((u) => u.id === id)?.name ?? id : null);
    const flat = (t: string, v: number, c: string, ow: string | null, cf: Record<string, unknown>) => ({
      title: t, value: v, currency: c, owner: ownerName(ow),
      ...Object.fromEntries(Object.entries(cf).map(([k, x]) => [`cf.${k}`, x])),
    });
    const changes = diffValues(labels,
      flat(cur.title, Number(cur.value.toString()), cur.currency, cur.ownerId, beforeCf),
      flat(data.title, value, data.currency, data.ownerId ?? null, customFields));
    if (changes.length) {
      await timeline.add({
        workspaceId: ctx.workspaceId, actorId: ctx.userId, type: "field_edit", contactId: cur.contactId, opportunityId: cur.id,
        summary: `Changed ${changes.map((x) => x.field).join(", ")} on "${data.title}"`, data: { changes },
      });
    }
    revalidatePath(`/opportunities/${cur.id}`);
    revalidatePath("/opportunities");
    return { version: data.version + 1 };
  });
}

/** F2.4 / F2.5: move to another stage of the same pipeline. Blocked (422) if the target stage's required fields are empty. */
export async function moveOpportunity(input: { opportunityId: string; version: number; stageId: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.edit");
    const data = z.object({ opportunityId: Id, version: Version, stageId: Id }).parse(input);
    const db = scoped(ctx);
    const cur = await db.opportunity.findFirst({ where: { id: data.opportunityId, deletedAt: null }, include: { stage: true } });
    if (!cur) throw NotFound();
    if (cur.stageId === data.stageId) return { version: cur.version };
    const target = await db.stage.findFirst({ where: { id: data.stageId, pipelineId: cur.pipelineId } });
    if (!target) throw NotFound();
    const defs = await activeFields(db, "OPPORTUNITY", cur.pipelineId);
    const missing = missingRequired(defs, target.requiredFieldIds, (cur.customFields ?? {}) as Record<string, unknown>);
    if (missing.length) throw needFieldsError(missing, target.name);

    const r = await db.opportunity.updateMany({
      where: { id: cur.id, version: data.version, deletedAt: null },
      data: { stageId: target.id, closedAt: target.kind === "OPEN" ? null : new Date(), version: { increment: 1 } },
    });
    if (r.count === 0) throw Conflict();
    await timeline.add({
      workspaceId: ctx.workspaceId, actorId: ctx.userId, type: "stage_change", contactId: cur.contactId, opportunityId: cur.id,
      summary: `Moved "${cur.title}" from ${cur.stage.name} to ${target.name}`, data: { from: cur.stage.name, to: target.name },
    });
    try {
      await leads.markActed({ workspaceId: ctx.workspaceId, contactId: cur.contactId, userId: ctx.userId, action: "stage_change" });
    } catch (e) {
      console.error("[opportunities] markActed failed", e);
    }
    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${cur.id}`);
    revalidatePath(`/contacts/${cur.contactId}`);
    return { version: data.version + 1 };
  });
}

export async function deleteOpportunity(input: { opportunityId: string; version: number }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.delete");
    const data = z.object({ opportunityId: Id, version: Version }).parse(input);
    const db = scoped(ctx);
    const cur = await db.opportunity.findFirst({ where: { id: data.opportunityId, deletedAt: null } });
    if (!cur) throw NotFound();
    const r = await db.opportunity.updateMany({
      where: { id: cur.id, version: data.version, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (r.count === 0) throw Conflict();
    await auditAs(ctx, "opportunity.deleted", "Opportunity", cur.id, { title: cur.title, contactId: cur.contactId, stageId: cur.stageId }, null);
    revalidatePath("/opportunities");
    revalidatePath(`/contacts/${cur.contactId}`);
    return null;
  });
}

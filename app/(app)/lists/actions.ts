"use server";
// P2 owns. Saved lists (F2.6, Q9): a list stores its filter, never its results, so it re-runs fresh every time.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { NotFound } from "@/lib/core/errors";
import { FilterSchema, buildWhere, type FilterEntity } from "@/lib/filters";

const PAGE_SIZE = 25;
const Entity = z.enum(["contact", "opportunity", "lead"], "Pick contacts, opportunities or leads.");
const Id = z.string().trim().min(1).max(64);

export type ListSummary = { id: string; name: string; entity: FilterEntity; shared: boolean; mine: boolean; criteria: number };

export async function listSavedLists() {
  return act(async (): Promise<ListSummary[]> => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const rows = await scoped(ctx).savedList.findMany({
      where: { OR: [{ userId: ctx.userId }, { shared: true }] }, orderBy: { createdAt: "desc" }, take: 100,
    });
    return rows.map((r) => ({
      id: r.id, name: r.name, entity: r.entity as FilterEntity, shared: r.shared, mine: r.userId === ctx.userId,
      criteria: Array.isArray(r.filters) ? r.filters.length : 0,
    }));
  });
}

export async function createSavedList(input: { name: string; entity: string; filters: unknown; shared?: boolean }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const name = z.string().trim().min(2, "Give the list a name of at least 2 characters.").max(80, "That name is too long.").parse(input.name);
    const entity = Entity.parse(input.entity);
    const filters = FilterSchema.parse(input.filters);
    if (filters.length === 0) throw new z.ZodError([{ code: "custom", message: "Add at least one criterion before saving.", path: ["filters"] }]);
    buildWhere(entity, filters, { userId: ctx.userId, canSeeValues: ctx.permissions.has("opportunity.value.view") }); // reject bad filters now
    const row = await scoped(ctx).savedList.create({
      data: { workspaceId: ctx.workspaceId, userId: ctx.userId, name, entity, filters: filters as object[], shared: !!input.shared },
    });
    revalidatePath("/lists");
    return { id: row.id };
  });
}

export async function deleteSavedList(input: { id: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const db = scoped(ctx);
    const row = await db.savedList.findFirst({ where: { id: Id.parse(input.id), userId: ctx.userId } });
    if (!row) throw NotFound();
    await db.savedList.delete({ where: { id: row.id } });
    revalidatePath("/lists");
    return null;
  });
}

export type ListResult = {
  name: string; entity: FilterEntity; columns: string[]; rows: { id: string; href: string; cells: string[] }[];
  total: number; page: number; pages: number;
};

/** Runs the saved filter right now, one page at a time. */
export async function runSavedList(input: { id: string; page?: number }) {
  return act(async (): Promise<ListResult> => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const db = scoped(ctx);
    const list = await db.savedList.findFirst({ where: { id: Id.parse(input.id), OR: [{ userId: ctx.userId }, { shared: true }] } });
    if (!list) throw NotFound();
    const entity = list.entity as FilterEntity;
    const canSeeValues = ctx.permissions.has("opportunity.value.view");
    const where = buildWhere(entity, list.filters, { userId: ctx.userId, canSeeValues });
    const requested = z.number().int().min(1).max(100000).catch(1).parse(input.page ?? 1);
    const skip = (requested - 1) * PAGE_SIZE;
    const base = { name: list.name, entity };
    const finish = (total: number, columns: string[], rows: ListResult["rows"]): ListResult => ({
      ...base, columns, rows, total, page: requested, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });

    if (entity === "contact") {
      const w = { ...where, deletedAt: null };
      const [total, rows] = await Promise.all([
        db.contact.count({ where: w }),
        db.contact.findMany({ where: w, orderBy: { createdAt: "desc" }, skip, take: PAGE_SIZE }),
      ]);
      return finish(total, ["Name", "Phone", "Email"], rows.map((c) => ({ id: c.id, href: `/contacts/${c.id}`, cells: [c.name, c.phone ?? "—", c.email ?? "—"] })));
    }
    if (entity === "opportunity") {
      const w = { ...where, deletedAt: null };
      const [total, rows] = await Promise.all([
        db.opportunity.count({ where: w }),
        db.opportunity.findMany({ where: w, orderBy: { createdAt: "desc" }, skip, take: PAGE_SIZE, include: { stage: { select: { name: true } }, contact: { select: { name: true } } } }),
      ]);
      return finish(total, ["Title", "Contact", "Stage", "Value"], rows.map((o) => ({
        id: o.id, href: `/opportunities/${o.id}`,
        cells: [o.title, o.contact.name, o.stage.name, canSeeValues ? `${o.currency} ${Number(o.value).toLocaleString()}` : "•••••"],
      })));
    }
    // Leads: people without company-wide access only ever see their own.
    const w = ctx.permissions.has("dashboard.company") ? where : { AND: [where, { ownerId: ctx.userId }] };
    const [total, rows] = await Promise.all([
      db.lead.count({ where: w }),
      db.lead.findMany({ where: w, orderBy: { createdAt: "desc" }, skip, take: PAGE_SIZE, include: { contact: { select: { name: true } } } }),
    ]);
    const owners = await db.user.findMany({ where: { id: { in: rows.map((r) => r.ownerId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const name = new Map(owners.map((u) => [u.id, u.name]));
    return finish(total, ["Contact", "Source", "Status", "Owner"], rows.map((l) => ({
      id: l.id, href: `/contacts/${l.contactId}`, cells: [l.contact.name, l.source, l.status, l.ownerId ? (name.get(l.ownerId) ?? "—") : "—"],
    })));
  });
}

/** Choices for the filter bar's drop-downs. */
export async function getFilterChoices() {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const db = scoped(ctx);
    const [users, stages, pipelines] = await Promise.all([
      db.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      db.stage.findMany({ select: { id: true, name: true, pipeline: { select: { name: true } } }, orderBy: [{ pipelineId: "asc" }, { order: "asc" }] }),
      db.pipeline.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return {
      me: ctx.userId, canSeeValues: ctx.permissions.has("opportunity.value.view"),
      users, pipelines,
      stages: stages.map((s) => ({ id: s.id, name: `${s.name} (${s.pipeline.name})` })),
    };
  });
}

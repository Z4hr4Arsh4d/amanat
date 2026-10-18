"use server";
// P1 owns. F2.1 companies. Soft delete; a company with contacts asks to unlink them first.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { Conflict, HttpError, NotFound } from "@/lib/core/errors";
import { activeFields, validateCustomFields } from "@/lib/crm/fields";
import { auditAs } from "@/lib/crm/log";
import { CustomIn, Id, Version } from "@/lib/crm/schemas";

const Name = z.string().trim().min(1, "Enter the company name").max(120, "Company name is too long");

export async function createCompany(input: { name: string; customFields?: Record<string, unknown> }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.create");
    const data = z.object({ name: Name, customFields: CustomIn }).parse(input);
    const db = scoped(ctx);
    const custom = validateCustomFields(await activeFields(db, "COMPANY"), data.customFields);
    const c = await db.company.create({ data: { workspaceId: ctx.workspaceId, name: data.name, customFields: custom } });
    revalidatePath("/companies");
    return { id: c.id };
  });
}

export async function updateCompany(input: { companyId: string; version: number; name: string; customFields?: Record<string, unknown> }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.edit");
    const data = z.object({ companyId: Id, version: Version, name: Name, customFields: CustomIn }).parse(input);
    const db = scoped(ctx);
    const cur = await db.company.findFirst({ where: { id: data.companyId, deletedAt: null } });
    if (!cur) throw NotFound();
    const custom = validateCustomFields(await activeFields(db, "COMPANY"), data.customFields);
    const r = await db.company.updateMany({
      where: { id: cur.id, version: data.version, deletedAt: null },
      data: { name: data.name, customFields: { ...((cur.customFields ?? {}) as object), ...custom }, version: { increment: 1 } },
    });
    if (r.count === 0) throw Conflict(); // Q4: someone else saved first
    revalidatePath("/companies");
    return { version: data.version + 1 };
  });
}

export async function deleteCompany(input: { companyId: string; version: number; unlinkContacts?: boolean }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.delete");
    const data = z.object({ companyId: Id, version: Version, unlinkContacts: z.boolean().optional() }).parse(input);
    const db = scoped(ctx);
    const cur = await db.company.findFirst({ where: { id: data.companyId, deletedAt: null } });
    if (!cur) throw NotFound();
    const linked = await db.contact.count({ where: { companyId: cur.id, deletedAt: null } });
    if (linked > 0 && !data.unlinkContacts) {
      throw new HttpError(409, `${cur.name} has ${linked} contact${linked === 1 ? "" : "s"}. Unlink them first.`, { linkedContacts: linked });
    }
    await db.$transaction(async (tx) => {
      if (linked > 0) await tx.contact.updateMany({ where: { companyId: cur.id }, data: { companyId: null } });
      const r = await tx.company.updateMany({
        where: { id: cur.id, version: data.version, deletedAt: null },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      if (r.count === 0) throw Conflict();
    });
    await auditAs(ctx, "company.deleted", "Company", cur.id, { name: cur.name, unlinkedContacts: linked }, null);
    revalidatePath("/companies");
    revalidatePath("/contacts");
    return null;
  });
}

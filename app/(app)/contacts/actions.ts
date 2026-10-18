"use server";
// P1 owns. F2.1 contacts, F2.7 notes + field-edit history, Q4 versioned updates.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission, type Ctx } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { Conflict, HttpError, NotFound } from "@/lib/core/errors";
import { activeFields, diffValues, validateCustomFields } from "@/lib/crm/fields";
import { normalizePhone } from "@/lib/crm/phone";
import { auditAs } from "@/lib/crm/log";
import { CustomIn, Id, NullableId, Version } from "@/lib/crm/schemas";
import * as timeline from "@/lib/crm/timeline";
import { leads } from "@/lib/shared/contracts";

const ContactIn = z.object({
  name: z.string().trim().min(1, "Enter the contact's name").max(120, "Name is too long"),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email address or leave it empty")]).optional(),
  phone: z.string().trim().max(30, "Phone number is too long").optional(),
  companyId: NullableId,
  ownerId: NullableId,
  tags: z.array(z.string().trim().min(1).max(30, "Each tag must be 30 characters or fewer")).max(20, "Use 20 tags or fewer").optional(),
  customFields: CustomIn,
});
type ContactInput = z.input<typeof ContactIn>;

async function cleanContact(ctx: Ctx, raw: ContactInput, selfId?: string) {
  const data = ContactIn.parse(raw);
  const db = scoped(ctx);
  const phone = normalizePhone(data.phone);
  if (phone === "INVALID") throw new HttpError(422, "Enter the phone with country code, e.g. +92 300 1234567 (or 0300 1234567).");
  if (phone) {
    const dup = await db.contact.findFirst({ where: { phone, ...(selfId ? { NOT: { id: selfId } } : {}) }, select: { name: true, deletedAt: true } });
    if (dup) throw new HttpError(409, dup.deletedAt ? "This phone belongs to a deleted contact. Use a different number." : `This phone already belongs to ${dup.name}.`);
  }
  if (data.companyId && !(await db.company.findFirst({ where: { id: data.companyId, deletedAt: null } }))) throw NotFound();
  if (data.ownerId && !(await db.user.findFirst({ where: { id: data.ownerId } }))) throw NotFound();
  const custom = validateCustomFields(await activeFields(db, "CONTACT"), data.customFields);
  const tags = [...new Set((data.tags ?? []).map((t) => t.toLowerCase()))];
  return {
    name: data.name, email: data.email || null, phone, companyId: data.companyId ?? null,
    ownerId: data.ownerId ?? null, tags, custom,
  };
}

export async function createContact(input: ContactInput) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.create");
    const c = await cleanContact(ctx, input);
    const row = await scoped(ctx).contact.create({
      data: {
        workspaceId: ctx.workspaceId, name: c.name, email: c.email, phone: c.phone, companyId: c.companyId,
        ownerId: c.ownerId ?? ctx.userId, tags: c.tags, customFields: c.custom,
      },
    });
    revalidatePath("/contacts");
    return { id: row.id };
  });
}

export async function updateContact(input: ContactInput & { contactId: string; version: number }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.edit");
    const { contactId, version } = z.object({ contactId: Id, version: Version }).parse(input);
    const db = scoped(ctx);
    const cur = await db.contact.findFirst({ where: { id: contactId, deletedAt: null } });
    if (!cur) throw NotFound();
    const c = await cleanContact(ctx, input, cur.id);
    const before = (cur.customFields ?? {}) as Record<string, unknown>;
    const customFields = { ...before, ...c.custom };

    const r = await db.contact.updateMany({
      where: { id: cur.id, version, deletedAt: null },
      data: {
        name: c.name, email: c.email, phone: c.phone, companyId: c.companyId, ownerId: c.ownerId,
        tags: c.tags, customFields, version: { increment: 1 },
      },
    });
    if (r.count === 0) throw Conflict();

    const defs = await activeFields(db, "CONTACT");
    const labels: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", companyId: "Company", ownerId: "Owner", tags: "Tags" };
    for (const d of defs) labels[`cf.${d.key}`] = d.label;
    const flat = (o: { name: string; email: string | null; phone: string | null; companyId: string | null; ownerId: string | null; tags: string[] }, cf: Record<string, unknown>) => ({
      name: o.name, email: o.email, phone: o.phone, companyId: o.companyId, ownerId: o.ownerId, tags: o.tags.join(", "),
      ...Object.fromEntries(Object.entries(cf).map(([k, v]) => [`cf.${k}`, v])),
    });
    const changes = diffValues(labels, flat(cur, before), flat(c, customFields));
    // Show names instead of ids for company/owner changes.
    for (const ch of changes) {
      if (ch.field === "Company" || ch.field === "Owner") {
        const model = ch.field === "Company" ? "company" : "user";
        for (const side of ["from", "to"] as const) {
          if (ch[side] === "(empty)") continue;
          const found = model === "company"
            ? await db.company.findFirst({ where: { id: ch[side] }, select: { name: true } })
            : await db.user.findFirst({ where: { id: ch[side] }, select: { name: true } });
          ch[side] = found?.name ?? ch[side];
        }
      }
    }
    if (changes.length) {
      await timeline.add({
        workspaceId: ctx.workspaceId, actorId: ctx.userId, type: "field_edit", contactId: cur.id,
        summary: `Changed ${changes.map((x) => x.field).join(", ")}`, data: { changes },
      });
    }
    revalidatePath(`/contacts/${cur.id}`);
    revalidatePath("/contacts");
    return { version: version + 1 };
  });
}

export async function deleteContact(input: { contactId: string; version: number }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.delete");
    const data = z.object({ contactId: Id, version: Version }).parse(input);
    const db = scoped(ctx);
    const cur = await db.contact.findFirst({ where: { id: data.contactId, deletedAt: null } });
    if (!cur) throw NotFound();
    const now = new Date();
    const opps = await db.$transaction(async (tx) => {
      const r = await tx.contact.updateMany({
        where: { id: cur.id, workspaceId: ctx.workspaceId, version: data.version, deletedAt: null },
        data: { deletedAt: now, version: { increment: 1 } },
      });
      if (r.count === 0) throw Conflict();
      const o = await tx.opportunity.updateMany({
        where: { contactId: cur.id, workspaceId: ctx.workspaceId, deletedAt: null },
        data: { deletedAt: now, version: { increment: 1 } },
      });
      return o.count;
    });
    await auditAs(ctx, "contact.deleted", "Contact", cur.id, { name: cur.name, phone: cur.phone, email: cur.email, opportunitiesDeleted: opps }, null);
    revalidatePath("/contacts");
    revalidatePath("/opportunities");
    return null;
  });
}

/** F2.7: a note on a contact and/or opportunity. Counts as acting on the lead (P2). */
export async function addNote(input: { contactId: string; opportunityId?: string | null; body: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.edit");
    const data = z.object({
      contactId: Id, opportunityId: Id.nullable().optional(),
      body: z.string().trim().min(1, "Write something first").max(2000, "Notes can be up to 2000 characters"),
    }).parse(input);
    const db = scoped(ctx);
    const contact = await db.contact.findFirst({ where: { id: data.contactId, deletedAt: null }, select: { id: true } });
    if (!contact) throw NotFound();
    if (data.opportunityId && !(await db.opportunity.findFirst({ where: { id: data.opportunityId, contactId: contact.id, deletedAt: null } }))) {
      throw NotFound();
    }
    await timeline.add({
      workspaceId: ctx.workspaceId, actorId: ctx.userId, type: "note", contactId: contact.id,
      opportunityId: data.opportunityId ?? null, summary: data.body,
    });
    try {
      await leads.markActed({ workspaceId: ctx.workspaceId, contactId: contact.id, userId: ctx.userId, action: "note" });
    } catch (e) {
      console.error("[notes] markActed failed", e);
    }
    revalidatePath(`/contacts/${contact.id}`);
    if (data.opportunityId) revalidatePath(`/opportunities/${data.opportunityId}`);
    return null;
  });
}

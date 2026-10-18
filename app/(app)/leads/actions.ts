"use server";
// P2 owns. Lead list + manual entry (F3.1, F3.3).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { HttpError, NotFound } from "@/lib/core/errors";
import { acknowledge } from "@/lib/leads/acknowledge";
import { reassign } from "@/lib/leads/reassign";
import { leadFilterWhere } from "@/lib/metrics";
import { findOrCreateContact, normalizePhone } from "@/lib/leads/contact";
import { intake } from "@/lib/leads/intake";

export type LeadRow = {
  id: string; contactId: string; contactName: string; source: "WEB_FORM" | "WHATSAPP" | "MANUAL";
  status: "NEW" | "ASSIGNED" | "ACKNOWLEDGED" | "UNASSIGNED" | "CLOSED";
  ownerName: string | null; reason: string | null; createdAt: string;
  isMine: boolean;
  msLeft: number | null; // time until the acknowledge deadline, measured on the server so clocks can't disagree
};

/** Open leads, newest first. People without company-wide access see only their own. */
const LeadFilter = z.enum(["today", "escalated24h"]).optional();

export async function listLeads(input: { filter?: string } = {}) {
  return act(async (): Promise<LeadRow[]> => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const db = scoped(ctx);
    const mine = !ctx.permissions.has("dashboard.company");
    const filter = LeadFilter.catch(undefined).parse(input.filter);
    // A dashboard drill-down uses the same where-builder as the tile, so the numbers match (Q12).
    const where = filter
      ? await leadFilterWhere({ workspaceId: ctx.workspaceId, userId: mine ? ctx.userId : undefined }, filter)
      : { status: { not: "CLOSED" as const }, ...(mine ? { ownerId: ctx.userId } : {}) };
    const leads = await db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { contact: { select: { name: true } }, assignments: { orderBy: { createdAt: "desc" }, take: 1, select: { reason: true } } },
    });
    const ownerIds = [...new Set(leads.map((l) => l.ownerId).filter((x): x is string => !!x))];
    const owners = await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } });
    const name = new Map(owners.map((o) => [o.id, o.name]));
    return leads.map((l) => ({
      id: l.id, contactId: l.contactId, contactName: l.contact.name, source: l.source, status: l.status,
      ownerName: l.ownerId ? (name.get(l.ownerId) ?? null) : null,
      reason: l.assignments[0]?.reason ?? null, createdAt: l.createdAt.toISOString(),
      isMine: l.ownerId === ctx.userId,
      msLeft: l.status === "ASSIGNED" && l.deadlineAt ? l.deadlineAt.getTime() - Date.now() : null,
    }));
  });
}

export type ContactLeadInfo = {
  lead: { id: string; source: LeadRow["source"]; status: LeadRow["status"]; ownerName: string | null; isMine: boolean; msLeft: number | null; ownerOnLeave: boolean } | null;
  history: { id: string; kind: string; to: string | null; reason: string; at: string }[];
};

/** For the contact page's lead box: the latest lead for this contact and who has held it. */
export async function getContactLead(contactId: string) {
  return act(async (): Promise<ContactLeadInfo> => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const id = z.string().trim().min(1).max(64).parse(contactId);
    const db = scoped(ctx);
    const lead = await db.lead.findFirst({ where: { contactId: id }, orderBy: { createdAt: "desc" }, include: { assignments: { orderBy: { createdAt: "desc" }, take: 20 } } });
    if (!lead) return { lead: null, history: [] };
    const ids = [...new Set([lead.ownerId, ...lead.assignments.map((a) => a.toUserId)].filter((x): x is string => !!x))];
    const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const name = new Map(users.map((u) => [u.id, u.name]));
    return {
      lead: {
        id: lead.id, source: lead.source, status: lead.status, isMine: lead.ownerId === ctx.userId,
        ownerName: lead.ownerId ? (name.get(lead.ownerId) ?? null) : null, ownerOnLeave: lead.ownerOnLeaveFlag,
        msLeft: lead.status === "ASSIGNED" && lead.deadlineAt ? lead.deadlineAt.getTime() - Date.now() : null,
      },
      history: lead.assignments.map((a) => ({
        id: a.id, kind: a.kind, to: a.toUserId ? (name.get(a.toUserId) ?? null) : null, reason: a.reason, at: a.createdAt.toISOString(),
      })),
    };
  });
}

export async function acknowledgeLead(input: { leadId: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const leadId = z.string().trim().min(1).max(64).parse(input.leadId);
    if (!(await scoped(ctx).lead.findFirst({ where: { id: leadId }, select: { id: true } }))) throw NotFound();
    const r = await acknowledge({ workspaceId: ctx.workspaceId, leadId, userId: ctx.userId });
    if (!r.ok) throw new HttpError(409, r.message);
    revalidatePath("/leads");
    return { message: r.message };
  });
}

const NewLead = z.object({
  name: z.string().trim().min(2, "Please enter the customer's name.").max(100),
  phone: z.string().trim().min(1, "Please enter a phone number.").max(30),
  email: z.union([z.literal(""), z.string().trim().email("That email address does not look right.").max(200)]),
});

export async function createManualLead(input: z.input<typeof NewLead>) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.create");
    const data = NewLead.parse(input);
    const phone = normalizePhone(data.phone);
    if (!phone) throw new HttpError(422, "That phone number does not look right. Include the area or country code.");
    const contact = await findOrCreateContact({ workspaceId: ctx.workspaceId, name: data.name, phone, email: data.email || null });
    const lead = await intake({ workspaceId: ctx.workspaceId, contactId: contact.id, source: "MANUAL", actorId: ctx.userId });
    revalidatePath("/leads");
    return { id: lead.id };
  });
}

export async function listAssignees() {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "leads.reassign");
    return scoped(ctx).user.findMany({ where: { isActive: true }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" } });
  });
}

export async function reassignLead(input: { leadId: string; toUserId: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "leads.reassign");
    const leadId = z.string().trim().min(1).max(64).parse(input.leadId);
    const toUserId = z.string().trim().min(1).max(64).parse(input.toUserId);
    const db = scoped(ctx);
    if (!(await db.lead.findFirst({ where: { id: leadId }, select: { id: true } }))) throw NotFound();
    if (!(await db.user.findFirst({ where: { id: toUserId }, select: { id: true } }))) throw NotFound();
    const r = await reassign({ workspaceId: ctx.workspaceId, leadId, toUserId, actorId: ctx.userId, actorLabel: ctx.name });
    if (!r.ok) throw new HttpError(409, r.message);
    revalidatePath("/leads");
    revalidatePath("/recovery");
    return { message: r.message };
  });
}

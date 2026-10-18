"use server";
// P2 owns. Lead list + manual entry (F3.1, F3.3).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { HttpError } from "@/lib/core/errors";
import { findOrCreateContact, normalizePhone } from "@/lib/leads/contact";
import { intake } from "@/lib/leads/intake";

export type LeadRow = {
  id: string; contactId: string; contactName: string; source: "WEB_FORM" | "WHATSAPP" | "MANUAL";
  status: "NEW" | "ASSIGNED" | "ACKNOWLEDGED" | "UNASSIGNED" | "CLOSED";
  ownerName: string | null; reason: string | null; createdAt: string;
};

/** Open leads, newest first. People without company-wide access see only their own. */
export async function listLeads() {
  return act(async (): Promise<LeadRow[]> => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const db = scoped(ctx);
    const mine = !ctx.permissions.has("dashboard.company");
    const leads = await db.lead.findMany({
      where: { status: { not: "CLOSED" }, ...(mine ? { ownerId: ctx.userId } : {}) },
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
    }));
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

// P1 owns. Shared contact operations used by both the server action and the REST API.
import { Conflict, NotFound } from "@/lib/core/errors";
import type { Ctx } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { auditAs } from "./log";

/** Soft-delete a contact and its opportunities in one transaction. version=null means "whatever is current". */
export async function softDeleteContact(ctx: Ctx, contactId: string, version: number | null) {
  const db = scoped(ctx);
  const cur = await db.contact.findFirst({ where: { id: contactId, deletedAt: null } });
  if (!cur) throw NotFound(); // also for other workspaces' ids (F1.6)
  const v = version ?? cur.version;
  const now = new Date();
  const opps = await db.$transaction(async (tx) => {
    const r = await tx.contact.updateMany({
      where: { id: cur.id, workspaceId: ctx.workspaceId, version: v, deletedAt: null },
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
  return { id: cur.id, opportunitiesDeleted: opps };
}

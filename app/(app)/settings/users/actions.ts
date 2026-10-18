"use server";
// P1 owns. F1.2 users & levels, F1.3 rules, F3.2 (admin sets anyone's status). All checks are server-side.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { HttpError, NotFound } from "@/lib/core/errors";
import { INVITE_DAYS, assertCanEditUser, assertCanGrantLevel, newInviteToken } from "@/lib/core/users";
import * as audit from "@/lib/audit";
import { leads } from "@/lib/shared/contracts";

const id = z.string().trim().min(1).max(64);
const LevelIn = z.enum(["ADMIN", "USER"], "Choose Admin or User");
const StatusIn = z.enum(["AVAILABLE", "BUSY", "ON_LEAVE", "OFFLINE"], "Choose a valid status");

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  level: LevelIn,
  roleId: id.nullable(),
});

export async function inviteUser(input: z.input<typeof InviteSchema>) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "users.manage");
    const data = InviteSchema.parse(input);
    assertCanGrantLevel(ctx, data.level);
    const db = scoped(ctx);
    if (data.roleId && !(await db.role.findFirst({ where: { id: data.roleId } }))) throw NotFound();
    if (await db.user.findFirst({ where: { email: data.email } })) {
      throw new HttpError(409, "Someone with this email is already in your workspace.");
    }
    const { token, tokenHash } = newInviteToken();
    const inv = await db.invite.create({
      data: {
        workspaceId: ctx.workspaceId, email: data.email, level: data.level, roleId: data.roleId, tokenHash,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
      },
    });
    await audit.record({
      workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "user.invited",
      targetType: "Invite", targetId: inv.id, after: { email: data.email, level: data.level, roleId: data.roleId },
    });
    revalidatePath("/settings/users");
    return { path: `/invite/${token}` }; // shown once; only the hash is stored
  });
}

export async function revokeInvite(input: { inviteId: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "users.manage");
    const inviteId = id.parse(input.inviteId);
    const db = scoped(ctx);
    const inv = await db.invite.findFirst({ where: { id: inviteId, acceptedAt: null } });
    if (!inv) throw NotFound();
    await db.invite.delete({ where: { id: inv.id } });
    await audit.record({
      workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "invite.revoked",
      targetType: "Invite", targetId: inv.id, before: { email: inv.email, level: inv.level },
    });
    revalidatePath("/settings/users");
    return null;
  });
}

const UpdateSchema = z.object({
  userId: id,
  level: LevelIn.optional(),
  roleId: id.nullable().optional(),
  status: StatusIn.optional(),
  isActive: z.boolean().optional(),
});

export async function updateUser(input: z.input<typeof UpdateSchema>) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "users.manage");
    const data = UpdateSchema.parse(input);
    const db = scoped(ctx);
    const target = await db.user.findFirst({
      where: { id: data.userId },
      select: { id: true, name: true, level: true, roleId: true, status: true, isActive: true },
    });
    if (!target) throw NotFound(); // also covers ids from another workspace (F1.6)
    assertCanEditUser(ctx, target);
    const isSelf = target.id === ctx.userId;

    if (data.level !== undefined && data.level !== target.level) {
      if (isSelf) throw new HttpError(403, "You can't change your own level. Ask another Admin or the Owner.");
      if (target.level === "OWNER") throw new HttpError(403, "The Owner's level can't be changed. There is always exactly one Owner.");
      assertCanGrantLevel(ctx, data.level);
    }
    if (data.isActive === false && isSelf) throw new HttpError(403, "You can't deactivate your own account.");
    if (data.isActive === false && target.level === "OWNER") throw new HttpError(403, "The Owner can't be deactivated.");
    if (data.roleId && !(await db.role.findFirst({ where: { id: data.roleId } }))) throw NotFound();

    const changes: { action: string; before: Record<string, string | boolean | null>; after: Record<string, string | boolean | null> }[] = [];
    if (data.level !== undefined && data.level !== target.level) changes.push({ action: "user.level_changed", before: { level: target.level }, after: { level: data.level } });
    if (data.roleId !== undefined && data.roleId !== target.roleId) changes.push({ action: "user.role_changed", before: { roleId: target.roleId }, after: { roleId: data.roleId } });
    if (data.status !== undefined && data.status !== target.status) changes.push({ action: "user.status_changed", before: { status: target.status }, after: { status: data.status } });
    if (data.isActive !== undefined && data.isActive !== target.isActive) {
      changes.push({ action: data.isActive ? "user.reactivated" : "user.deactivated", before: { isActive: target.isActive }, after: { isActive: data.isActive } });
    }
    if (changes.length === 0) return null;

    await db.user.update({
      where: { id: target.id },
      data: { level: data.level, roleId: data.roleId, status: data.status, isActive: data.isActive },
    });
    if (data.isActive === false) await db.session.deleteMany({ where: { userId: target.id } }); // log them out everywhere

    for (const c of changes) {
      await audit.record({
        workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: c.action,
        targetType: "User", targetId: target.id, before: { name: target.name, ...c.before }, after: { name: target.name, ...c.after },
      });
    }

    // F3.6: going away (or being deactivated) hands their unacknowledged leads to someone else (P2's logic).
    const away = data.status === "ON_LEAVE" || data.status === "OFFLINE" || data.isActive === false;
    if (away) {
      try {
        await leads.handleAbsence({ workspaceId: ctx.workspaceId, userId: target.id });
      } catch (e) {
        console.error("[users] handleAbsence failed", e);
      }
    }
    revalidatePath("/settings/users");
    return null;
  });
}

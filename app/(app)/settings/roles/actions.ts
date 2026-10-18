"use server";
// P1 owns. F1.3 custom roles with a permission grid. Q4: a role in use can't be deleted.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { HttpError, NotFound } from "@/lib/core/errors";
import { ALL_PERMISSIONS, type Permission } from "@/lib/shared/permissions";
import * as audit from "@/lib/audit";

const id = z.string().trim().min(1).max(64);
const RoleName = z.string().trim().min(2, "Role name must be at least 2 characters").max(40, "Role name must be 40 characters or fewer");
const Perms = z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]], "Unknown permission")).max(ALL_PERMISSIONS.length);

export async function createRole(input: { name: string; permissions?: string[] }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "users.manage");
    const name = RoleName.parse(input.name);
    const permissions = [...new Set(Perms.parse(input.permissions ?? []))];
    const db = scoped(ctx);
    if (await db.role.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) {
      throw new HttpError(409, `A role called "${name}" already exists. Pick another name.`);
    }
    const role = await db.role.create({ data: { workspaceId: ctx.workspaceId, name, permissions } });
    await audit.record({
      workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "role.created",
      targetType: "Role", targetId: role.id, after: { name, permissions },
    });
    revalidatePath("/settings/roles");
    return null;
  });
}

export async function updateRole(input: { roleId: string; name: string; permissions: string[] }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "users.manage");
    const roleId = id.parse(input.roleId);
    const name = RoleName.parse(input.name);
    const permissions = [...new Set(Perms.parse(input.permissions))].sort();
    const db = scoped(ctx);
    const role = await db.role.findFirst({ where: { id: roleId } });
    if (!role) throw NotFound();
    if (name !== role.name && (await db.role.findFirst({ where: { name: { equals: name, mode: "insensitive" }, NOT: { id: roleId } } }))) {
      throw new HttpError(409, `A role called "${name}" already exists. Pick another name.`);
    }
    const beforePerms = [...role.permissions].sort();
    const permsChanged = beforePerms.join(",") !== permissions.join(",");
    if (name === role.name && !permsChanged) return null;

    await db.role.update({ where: { id: roleId }, data: { name, permissions } });
    if (name !== role.name) {
      await audit.record({
        workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "role.renamed",
        targetType: "Role", targetId: roleId, before: { name: role.name }, after: { name },
      });
    }
    if (permsChanged) {
      await audit.record({
        workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "role.permissions_changed",
        targetType: "Role", targetId: roleId, before: { name: role.name, permissions: beforePerms }, after: { name, permissions },
      });
    }
    revalidatePath("/settings/roles");
    revalidatePath("/settings/users");
    return null;
  });
}

export async function deleteRole(input: { roleId: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "users.manage");
    const roleId = id.parse(input.roleId);
    const db = scoped(ctx);
    const role = await db.role.findFirst({ where: { id: roleId } });
    if (!role) throw NotFound();
    const inUse = await db.user.count({ where: { roleId } });
    if (inUse > 0) {
      throw new HttpError(409, `${inUse} ${inUse === 1 ? "person uses" : "people use"} "${role.name}". Move them to another role on the Users page first.`);
    }
    await db.role.delete({ where: { id: roleId } });
    await audit.record({
      workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "role.deleted",
      targetType: "Role", targetId: roleId, before: { name: role.name, permissions: role.permissions },
    });
    revalidatePath("/settings/roles");
    return null;
  });
}

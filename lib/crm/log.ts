// P1 owns. Shorthand for audit entries made by a logged-in user.
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/core/session";
import * as audit from "@/lib/audit";

export function auditAs(ctx: Ctx, action: string, targetType: string, targetId: string | null,
  before?: Prisma.InputJsonValue | null, after?: Prisma.InputJsonValue | null) {
  return audit.record({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action, targetType, targetId, before, after });
}

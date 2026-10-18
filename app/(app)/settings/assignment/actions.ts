"use server";
// P2 owns. Assignment settings (PLAN.md §3.3). Every change is audited.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { HttpError } from "@/lib/core/errors";
import * as audit from "@/lib/audit";

const Level = z.object({
  type: z.enum(["NEXT_ELIGIBLE", "BACKUP", "MANAGER"], "Pick a valid level type."),
  seconds: z.number({ error: "Enter the seconds as a number." }).int("Seconds must be a whole number.").min(5, "Each level needs at least 5 seconds.").max(86400),
});

const Settings = z.object({
  maxOpenLeads: z.number().int("Max open leads must be a whole number.").min(1, "Max open leads must be at least 1.").max(1000),
  ackWindowSeconds: z.number().int().min(5, "The acknowledge window needs at least 5 seconds.").max(86400),
  idleSeconds: z.number().int().min(5, "The idle period needs at least 5 seconds.").max(604800),
  levels: z.array(Level).min(1, "Add at least one escalation level.").max(10, "Use 10 levels or fewer."),
  backupUserId: z.string().trim().min(1).max(64).nullable(),
  managerUserId: z.string().trim().min(1).max(64).nullable(),
  useCalendarBusy: z.boolean(),
  autoReplyCustomer: z.boolean(),
});

export type AssignmentSettings = z.infer<typeof Settings>;

export async function saveAssignmentSettings(input: AssignmentSettings) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "assignment.manage");
    const data = Settings.parse(input);
    const db = scoped(ctx);

    for (const [label, id] of [["backup", data.backupUserId], ["manager", data.managerUserId]] as const) {
      if (id && !(await db.user.findFirst({ where: { id, isActive: true } }))) {
        throw new HttpError(422, `The ${label} person you picked is not an active team member. Pick someone else.`);
      }
    }
    if (data.levels.some((l) => l.type === "BACKUP") && !data.backupUserId) {
      throw new HttpError(422, "You have a Backup level but no backup person. Pick a backup person or remove that level.");
    }
    if (data.levels.some((l) => l.type === "MANAGER") && !data.managerUserId) {
      throw new HttpError(422, "You have a Manager level but no manager. Pick a manager or remove that level.");
    }

    const before = await db.assignmentConfig.findFirst({
      select: { maxOpenLeads: true, ackWindowSeconds: true, idleSeconds: true, levels: true, backupUserId: true, managerUserId: true, useCalendarBusy: true, autoReplyCustomer: true },
    });
    await db.assignmentConfig.upsert({ where: { workspaceId: ctx.workspaceId }, create: { workspaceId: ctx.workspaceId, ...data }, update: data });
    await audit.record({
      workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "assignment.settings_changed",
      targetType: "AssignmentConfig", targetId: ctx.workspaceId, before: before ?? null, after: data,
    });
    revalidatePath("/settings/assignment");
    return null;
  });
}

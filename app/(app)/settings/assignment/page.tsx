import { requireUserPage, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NoAccess } from "@/components/ui/NoAccess";
import { ensureConfig } from "@/lib/leads/assign";
import { AssignmentForm } from "./AssignmentForm";

export default async function Page() {
  const ctx = await requireUserPage();
  if (!can(ctx, "assignment.manage")) return <NoAccess what="change assignment settings" />;
  const cfg = await ensureConfig(ctx.workspaceId);
  const users = await scoped(ctx).user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const levels = (Array.isArray(cfg.levels) ? cfg.levels : []) as { type: "NEXT_ELIGIBLE" | "BACKUP" | "MANAGER"; seconds: number }[];
  return (
    <AssignmentForm
      users={users}
      initial={{
        maxOpenLeads: cfg.maxOpenLeads, ackWindowSeconds: cfg.ackWindowSeconds, idleSeconds: cfg.idleSeconds, levels,
        backupUserId: cfg.backupUserId, managerUserId: cfg.managerUserId,
        useCalendarBusy: cfg.useCalendarBusy, autoReplyCustomer: cfg.autoReplyCustomer,
      }}
    />
  );
}

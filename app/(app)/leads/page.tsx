import { requireUserPage, can } from "@/lib/core/session";
import { LeadsClient } from "./LeadsClient";

export default async function Page() {
  const ctx = await requireUserPage();
  return <LeadsClient canCreate={can(ctx, "crm.create")} canManageTeam={can(ctx, "users.manage")} canReassign={can(ctx, "leads.reassign")} />;
}

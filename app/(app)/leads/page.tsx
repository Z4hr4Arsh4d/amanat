import { requireUserPage, can } from "@/lib/core/session";
import { LeadsClient } from "./LeadsClient";

export default async function Page({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ctx = await requireUserPage();
  const { filter } = await searchParams;
  return (
    <LeadsClient
      canCreate={can(ctx, "crm.create")} canManageTeam={can(ctx, "users.manage")} canReassign={can(ctx, "leads.reassign")}
      filter={filter === "today" || filter === "escalated24h" ? filter : undefined}
    />
  );
}

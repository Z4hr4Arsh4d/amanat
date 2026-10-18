import { requireUserPage, can } from "@/lib/core/session";
import { RecoveryClient } from "./RecoveryClient";

export default async function Page() {
  const ctx = await requireUserPage();
  return <RecoveryClient canReassign={can(ctx, "leads.reassign")} />;
}

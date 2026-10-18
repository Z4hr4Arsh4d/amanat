import { requireUserPage } from "@/lib/core/session";
import { DashboardClient } from "./DashboardClient";

export default async function Page() {
  await requireUserPage();
  return <DashboardClient />;
}

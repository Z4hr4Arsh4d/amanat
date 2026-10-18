import { requireUserPage } from "@/lib/core/session";
import { ListsClient } from "./ListsClient";

export default async function Page() {
  await requireUserPage();
  return <ListsClient />;
}

import { requireUserPage } from "@/lib/core/session";
import { ListRunner } from "./ListRunner";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUserPage();
  const { id } = await params;
  return <ListRunner id={id} />;
}

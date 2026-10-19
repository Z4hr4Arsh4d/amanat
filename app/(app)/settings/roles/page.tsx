// P1 owns. F1.3.
import { requireUserPage, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NoAccess } from "@/components/ui/NoAccess";
import { PageHeader } from "@/components/ui/Kit";
import { PERMISSIONS } from "@/lib/shared/permissions";
import { RolesClient } from "./RolesClient";

export default async function RolesPage() {
  const ctx = await requireUserPage();
  if (!can(ctx, "users.manage")) return <NoAccess what="manage roles" />;
  const roles = await scoped(ctx).role.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, permissions: true, _count: { select: { users: true } } },
  });
  const perms = Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label }));
  return (
    <section className="space-y-6">
      <PageHeader title="Roles" description="A role decides what a User can do. Owners and Admins always have every permission." />
      <RolesClient roles={roles.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions, users: r._count.users }))} perms={perms} />
    </section>
  );
}

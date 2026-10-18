// P1 owns. F1.2 / F1.3 / F3.2.
import { requireUserPage, can } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { NoAccess } from "@/components/ui/NoAccess";
import { ui } from "@/components/ui/styles";
import { UsersClient } from "./UsersClient";

export default async function UsersPage() {
  const ctx = await requireUserPage();
  if (!can(ctx, "users.manage")) return <NoAccess what="manage users" />;
  const db = scoped(ctx);
  const [users, roles, invites] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, level: true, roleId: true, status: true, isActive: true },
    }),
    db.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.invite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, level: true, expiresAt: true },
    }),
  ]);
  return (
    <section className="space-y-6">
      <div>
        <h1 className={ui.h1}>Users</h1>
        <p className={ui.muted}>Invite people, set their level and role, and set who is available for leads.</p>
      </div>
      <UsersClient me={{ id: ctx.userId, level: ctx.level }} users={users} roles={roles} invites={invites} />
    </section>
  );
}

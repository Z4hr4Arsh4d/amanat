// P1 owns. Two workspaces (to demo isolation), users with mixed levels/statuses,
// default pipeline. P1: extend with 300 contacts, 40 companies, 80 opportunities, 2nd pipeline (PLAN §2.5).
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { MANAGER_DEFAULT, SALES_DEFAULT } from "../../lib/shared/permissions";

export async function seedCore(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash("password123", 12);
  const out = [];
  for (const [name, slug, domain] of [["Sunrise Solar", "sunrise-solar", "sunrise.test"], ["Capital Realty", "capital-realty", "capital.test"]]) {
    await prisma.workspace.deleteMany({ where: { slug } });
    const ws = await prisma.workspace.create({ data: { name, slug } });
    const manager = await prisma.role.create({ data: { workspaceId: ws.id, name: "Manager", permissions: MANAGER_DEFAULT } });
    const sales = await prisma.role.create({ data: { workspaceId: ws.id, name: "Sales", permissions: SALES_DEFAULT } });
    const mk = (email: string, n: string, level: "OWNER" | "ADMIN" | "USER", roleId?: string, status: "AVAILABLE" | "BUSY" | "ON_LEAVE" | "OFFLINE" = "AVAILABLE") =>
      prisma.user.create({ data: { workspaceId: ws.id, email: `${email}@${domain}`, name: n, passwordHash, level, roleId, status } });
    const owner = await mk("owner", "Ayesha Owner", "OWNER");
    await mk("admin", "Bilal Admin", "ADMIN");
    const mgr = await mk("manager", "Omar Manager", "USER", manager.id);
    await mk("hina", "Hina Khan", "USER", sales.id);
    const sara = await mk("sara", "Sara Ali", "USER", sales.id);
    await mk("ali", "Ali Raza", "USER", sales.id, "ON_LEAVE");
    const p = await prisma.pipeline.create({ data: { workspaceId: ws.id, name: "Sales", isDefault: true } });
    const stages: [string, "OPEN" | "WON" | "LOST"][] = [["New", "OPEN"], ["Qualified", "OPEN"], ["Proposal", "OPEN"], ["Won", "WON"], ["Lost", "LOST"]];
    await prisma.stage.createMany({ data: stages.map(([n, kind], order) => ({ workspaceId: ws.id, pipelineId: p.id, name: n, kind, order })) });
    await prisma.assignmentConfig.create({
      data: { workspaceId: ws.id, ackWindowSeconds: 30, managerUserId: mgr.id, backupUserId: sara.id },
    });
    void owner;
    out.push(ws);
  }
  return out;
}

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { MANAGER_DEFAULT, SALES_DEFAULT } from "@/lib/shared/permissions";

const MAX_FAILS = 5;
const WINDOW_MIN = 15;

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12); // salted, recognised algorithm (Q1)
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/** Q1: block repeated guessing per email and per IP. Returns minutes to wait, or 0. */
export async function loginLockMinutes(email: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  return byEmail >= MAX_FAILS || byIp >= MAX_FAILS * 4 ? WINDOW_MIN : 0;
}

export async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  await prisma.loginAttempt.create({ data: { email, ip, success } });
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "workspace";
}

/** F1.1: sign-up creates a workspace with sensible defaults and makes the user its Owner. */
export async function createWorkspaceWithOwner(input: { company: string; name: string; email: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  let slug = slugify(input.company);
  if (await prisma.workspace.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({ data: { name: input.company, slug } });
    const owner = await tx.user.create({
      data: { workspaceId: ws.id, email: input.email, name: input.name, passwordHash, level: "OWNER" },
    });
    await tx.role.createMany({
      data: [
        { workspaceId: ws.id, name: "Manager", permissions: MANAGER_DEFAULT },
        { workspaceId: ws.id, name: "Sales", permissions: SALES_DEFAULT },
      ],
    });
    const pipeline = await tx.pipeline.create({ data: { workspaceId: ws.id, name: "Sales", isDefault: true } });
    const stages: [string, "OPEN" | "WON" | "LOST"][] = [
      ["New", "OPEN"], ["Qualified", "OPEN"], ["Proposal", "OPEN"], ["Won", "WON"], ["Lost", "LOST"],
    ];
    await tx.stage.createMany({
      data: stages.map(([name, kind], order) => ({ workspaceId: ws.id, pipelineId: pipeline.id, name, kind, order })),
    });
    await tx.assignmentConfig.create({ data: { workspaceId: ws.id, managerUserId: owner.id } });
    return { workspace: ws, owner };
  });
}

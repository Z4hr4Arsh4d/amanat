"use server";
// P1 owns.
import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSession, destroyAllSessions, destroySession, getCtx, sha256 } from "@/lib/core/session";
import { createWorkspaceWithOwner, hashPassword, loginLockMinutes, recordLoginAttempt, verifyPassword } from "@/lib/core/auth";
import { HttpError } from "@/lib/core/errors";
import * as audit from "@/lib/audit";

export type FormState = { error?: string; fields?: Record<string, string> };

const SignupSchema = z.object({
  company: z.string().trim().min(2, "Company name must be at least 2 characters").max(80),
  name: z.string().trim().min(2, "Your name must be at least 2 characters").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries(fd) as Record<string, string>;
  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { ...raw, password: "" } };
  const { owner } = await createWorkspaceWithOwner(parsed.data);
  await createSession(owner.id);
  redirect("/dashboard");
}

const LoginSchema = z.object({
  workspace: z.string().trim().toLowerCase().min(1, "Enter your workspace"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries(fd) as Record<string, string>;
  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { ...raw, password: "" } };
  const { workspace, email, password } = parsed.data;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const wait = await loginLockMinutes(email, ip);
  if (wait) return { error: `Too many failed attempts. Try again in ${wait} minutes.`, fields: { workspace, email } };

  const user = await prisma.user.findFirst({ where: { email, workspace: { slug: workspace }, isActive: true } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  await recordLoginAttempt(email, ip, ok);
  if (!user || !ok) return { error: "Workspace, email or password is incorrect.", fields: { workspace, email } };

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/** Q1: "Log out everywhere" — deletes every session of this user (all devices). */
export async function logoutAllAction() {
  const ctx = await getCtx();
  if (ctx) await destroyAllSessions(ctx.userId);
  await destroySession();
  redirect("/login");
}

const AcceptSchema = z.object({
  name: z.string().trim().min(2, "Your name must be at least 2 characters").max(80),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

/** F1.2: accept an invite link → create the user with the invited level/role and log them in. */
export async function acceptInviteAction(token: string, _: FormState, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries(fd) as Record<string, string>;
  const parsed = AcceptSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { name: raw.name ?? "", password: "" } };

  const inv = await prisma.invite.findUnique({ where: { tokenHash: sha256(token) } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
    return { error: "This invite link is not valid or has expired. Ask your admin for a new one." };
  }
  const passwordHash = await hashPassword(parsed.data.password);

  let userId: string;
  try {
    userId = await prisma.$transaction(async (tx) => {
      // Claim the invite first so the same link can never create two accounts.
      const claimed = await tx.invite.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count === 0) throw new HttpError(409, "This invite has already been used. Log in instead.");
      const role = inv.roleId ? await tx.role.findFirst({ where: { id: inv.roleId, workspaceId: inv.workspaceId } }) : null;
      const u = await tx.user.create({
        data: {
          workspaceId: inv.workspaceId, email: inv.email, name: parsed.data.name, passwordHash,
          level: inv.level === "OWNER" ? "USER" : inv.level, roleId: role?.id ?? null,
        },
      });
      return u.id;
    });
  } catch (e) {
    if (e instanceof HttpError) return { error: e.message, fields: { name: parsed.data.name } };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "An account with this email already exists in this workspace. Log in instead." };
    }
    throw e;
  }

  await audit.record({
    workspaceId: inv.workspaceId, actorId: userId, actorLabel: parsed.data.name, action: "user.joined",
    targetType: "User", targetId: userId, after: { email: inv.email, level: inv.level, roleId: inv.roleId },
  });
  await createSession(userId);
  redirect("/dashboard");
}

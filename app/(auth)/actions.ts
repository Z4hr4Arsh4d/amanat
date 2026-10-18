"use server";
// P1 owns.
import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, destroySession } from "@/lib/core/session";
import { createWorkspaceWithOwner, loginLockMinutes, recordLoginAttempt, verifyPassword } from "@/lib/core/auth";

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

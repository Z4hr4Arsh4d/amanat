import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Level } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALL_PERMISSIONS, type Permission } from "@/lib/shared/permissions";
import { Forbidden, Unauthorized } from "./errors";

export const SESSION_COOKIE = "amanat_session";
const SESSION_DAYS = 7; // server-side expiry, slides forward while the user is active
const COOKIE_DAYS = 30; // browser keeps the cookie longer; the DB row decides if it is still valid

export type Ctx = {
  userId: string;
  workspaceId: string;
  level: Level;
  name: string;
  email: string;
  timezone: string;
  permissions: Set<Permission>;
};

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.session.create({ data: { userId, tokenHash: sha256(token), expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    expires: new Date(Date.now() + COOKIE_DAYS * 864e5),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Returns the logged-in user's context, or null. Cached per request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: true } } },
  });
  if (!s || s.expiresAt < new Date() || !s.user.isActive) return null;
  // Sliding refresh: an active user stays logged in; 7 days of no use logs them out.
  if (s.expiresAt.getTime() - Date.now() < (SESSION_DAYS - 1) * 864e5) {
    await prisma.session.updateMany({ where: { id: s.id }, data: { expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) } });
  }
  const u = s.user;
  const permissions = new Set<Permission>(
    u.level === "USER" ? ((u.role?.permissions ?? []) as Permission[]) : ALL_PERMISSIONS,
  );
  return { userId: u.id, workspaceId: u.workspaceId, level: u.level, name: u.name, email: u.email, timezone: u.timezone, permissions };
});

/** For API routes / server actions: throws 401. */
export async function requireUser(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw Unauthorized();
  return ctx;
}

/** For server components (pages): redirects to /login. */
export async function requireUserPage(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  return ctx;
}

export function can(ctx: Ctx, p: Permission) {
  return ctx.permissions.has(p);
}

/** Server-side permission check (F1.5). Owner and Admin have every permission; Users get their role's. */
export function requirePermission(ctx: Ctx, p: Permission) {
  if (!can(ctx, p)) throw Forbidden(p);
}

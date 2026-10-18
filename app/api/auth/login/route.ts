// P1 owns. JSON login for scripts/tests (same rules as the login page: lockout after repeated failures, Q1).
import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/core/session";
import { loginLockMinutes, recordLoginAttempt, verifyPassword } from "@/lib/core/auth";
import { HttpError, handler } from "@/lib/core/errors";

const Body = z.object({
  workspace: z.string().trim().toLowerCase().min(1, "Enter your workspace"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password").max(200),
});

export const POST = handler(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(422, parsed.error.issues[0].message);
  const { workspace, email, password } = parsed.data;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const wait = await loginLockMinutes(email, ip);
  if (wait) throw new HttpError(429, `Too many failed attempts. Try again in ${wait} minutes.`);
  const user = await prisma.user.findFirst({ where: { email, workspace: { slug: workspace }, isActive: true } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  await recordLoginAttempt(email, ip, ok);
  if (!user || !ok) throw new HttpError(401, "Workspace, email or password is incorrect.");
  await createSession(user.id);
  return Response.json({ ok: true, user: { id: user.id, name: user.name, level: user.level } });
});

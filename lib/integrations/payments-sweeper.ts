// P3 owns. Worker job (I2.5): an unpaid checkout older than ABANDON_SECONDS is shown as ABANDONED
// ("Customer opened the link but did not pay"). If they pay later, the webhook still sets PAID.
// Plain Prisma only (the worker must not import server-only modules). Safe to run in two workers at once.
import { prisma } from "@/lib/db";
import { ensureEnv } from "./env";

export async function markAbandonedPayments(): Promise<void> {
  ensureEnv();
  const seconds = Math.max(10, Number(process.env.ABANDON_SECONDS ?? 120) || 120);
  const cutoff = new Date(Date.now() - seconds * 1000);
  // One conditional update: two workers running together cannot both change the same row.
  await prisma.payment.updateMany({ where: { status: "PENDING", createdAt: { lt: cutoff } }, data: { status: "ABANDONED" } });
}

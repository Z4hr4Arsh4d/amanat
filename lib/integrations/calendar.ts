// P3 owns. Calendar features (I3). isBusyNow() signature is a CONTRACT (used by P2's routing).
// The contract part imports nothing server-only, so P2 can call it from the worker too.
import { prisma } from "@/lib/db";
import { freeBusy } from "./google";

const cache = new Map<string, { at: number; value: false | { until: Date } }>();

/**
 * CONTRACT. Is this employee in a calendar event right now? Returns { until } (end of the current busy block)
 * or false if free, not connected, needing reconnect, or on any error. Cached for 60s per user.
 */
export async function isBusyNow(userId: string): Promise<false | { until: Date }> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  let value: false | { until: Date } = false;
  try {
    const conn = await prisma.calendarConnection.findUnique({ where: { userId }, select: { status: true } });
    if (conn?.status === "CONNECTED") {
      const now = new Date();
      const fb = await freeBusy(userId, now, new Date(now.getTime() + 60_000));
      const current = fb.busy.filter((b) => b.start <= now && b.end > now).sort((a, b) => b.end.getTime() - a.end.getTime())[0];
      if (current) value = { until: current.end };
    }
  } catch {
    value = false;
  }
  cache.set(userId, { at: Date.now(), value });
  return value;
}

/** Drop the cached answer (after booking/cancelling, so routing sees the change at once). */
export function forgetBusy(userId: string) {
  cache.delete(userId);
}

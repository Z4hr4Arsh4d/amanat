// P3 owns. Time-zone helpers (I3.5). Times are stored in UTC (timestamptz) together with the employee's IANA zone,
// so they are unambiguous; they are typed in and shown in the employee's zone.

export function isValidZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at instant `at`, in minutes (e.g. Asia/Karachi → +300). */
export function zoneOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * "2026-10-20" + "15:30" in "Asia/Karachi" → the UTC instant. Returns null for impossible input
 * (e.g. a time skipped by a daylight-saving change).
 */
export function zonedToUtc(date: string, time: string, tz: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  let guess = wall - zoneOffsetMinutes(tz, new Date(wall)) * 60_000;
  guess = wall - zoneOffsetMinutes(tz, new Date(guess)) * 60_000; // second pass handles DST edges
  const back = toZonedParts(new Date(guess), tz);
  if (back.date !== date || back.time !== time) return null;
  return new Date(guess);
}

/** UTC instant → { date: "2026-10-20", time: "15:30" } in `tz`. */
export function toZonedParts(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** "UTC+5" / "UTC-4:30" label for a zone at a given instant. */
export function offsetLabel(tz: string, at = new Date()) {
  const m = zoneOffsetMinutes(tz, at);
  const sign = m >= 0 ? "+" : "-";
  const abs = Math.abs(m);
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
}

/** "Tue 20 Oct, 15:30" in `tz`. */
export function formatInZone(at: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

export function formatTimeInZone(at: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

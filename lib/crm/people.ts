// P1 owns. Small lookups used by CRM pages.
import type { scoped } from "@/lib/core/scoped";

export async function teamOptions(db: ReturnType<typeof scoped>) {
  return db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export function nameMap(users: { id: string; name: string }[]) {
  return new Map(users.map((u) => [u.id, u.name]));
}

export const PAGE_SIZE = 25;

export function pageFrom(v: string | string[] | undefined) {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : 1;
}
export function qFrom(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v ?? "").trim().slice(0, 100);
}

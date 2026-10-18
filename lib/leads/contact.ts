// P2 owns. Find-or-create a contact from a form or manual entry (PLAN.md §3.1).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** "0300 1234567" → "+923001234567". Returns null if it can't be a real phone number. Local numbers are assumed to be Pakistani. */
export function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (s.startsWith("0")) s = "+92" + s.slice(1);
  else if (/^\d/.test(s)) s = "+" + s;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export async function findOrCreateContact(input: {
  workspaceId: string; name: string; phone?: string | null; email?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const { workspaceId, name } = input;
  const phone = input.phone ?? null;
  const email = input.email ? input.email.toLowerCase() : null;
  const or: Prisma.ContactWhereInput[] = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email: { equals: email, mode: "insensitive" } });
  const find = () => (or.length ? prisma.contact.findFirst({ where: { workspaceId, deletedAt: null, OR: or }, select: { id: true } }) : null);

  const existing = await find();
  if (existing) return { id: existing.id, created: false };
  try {
    const c = await prisma.contact.create({ data: { workspaceId, name, phone, email }, select: { id: true } });
    return { id: c.id, created: true };
  } catch (e) {
    // Two people submitted the same phone at once: the other request won, use theirs.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await find();
      if (again) return { id: again.id, created: false };
    }
    throw e;
  }
}

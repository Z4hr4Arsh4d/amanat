// P1 owns. STUB — replace body with the hash-chained implementation (PLAN.md §2.9).
// Signature is a CONTRACT: do not change it.
import type { Prisma } from "@prisma/client";

export type AuditInput = {
  workspaceId: string;
  actorId: string | null; // null = system
  actorLabel?: string; // e.g. "Hina Khan" or "System (escalation worker)"
  action: string; // e.g. "lead.escalated", "role.permissions_changed"
  targetType: string;
  targetId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
};

export async function record(input: AuditInput): Promise<void> {
  console.log("[audit stub]", input.action, input.targetType, input.targetId);
}

/** Recompute the chain. Returns null if intact, else the first broken seq. */
export async function verifyChain(workspaceId: string): Promise<{ ok: boolean; checked: number; brokenAt?: number }> {
  void workspaceId;
  return { ok: true, checked: 0 };
}

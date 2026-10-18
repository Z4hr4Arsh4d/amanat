// P2 owns. Absence handling (PLAN.md §3.6).
import { prisma } from "@/lib/db";

/** Called by setStatus() when someone goes On leave / Offline (F3.6). */
export async function handleAbsence(input: { workspaceId: string; userId: string }): Promise<void> {
  void input; // filled in with part 6, after the reassign engine exists
}

/** Back to Available: their acknowledged leads are no longer "Owner away". */
export async function returnFromAbsence(input: { workspaceId: string; userId: string }): Promise<void> {
  await prisma.lead.updateMany({
    where: { workspaceId: input.workspaceId, ownerId: input.userId, ownerOnLeaveFlag: true },
    data: { ownerOnLeaveFlag: false, version: { increment: 1 } },
  });
}

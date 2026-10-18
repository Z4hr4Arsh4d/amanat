// P2 owns. Availability (PLAN.md §3.2): status changes are audited and trigger absence handling.
import type { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import * as audit from "@/lib/audit";
import { handleAbsence, returnFromAbsence } from "./absence";
import { STATUS_LABEL } from "./assign";

/** Change someone's status. Going On leave / Offline moves their unacknowledged leads away right now. */
export async function setStatus(input: { workspaceId: string; userId: string; status: UserStatus; actorId: string | null; actorLabel?: string }) {
  const { workspaceId, userId, status } = input;
  const user = await prisma.user.findFirst({ where: { id: userId, workspaceId }, select: { status: true, name: true } });
  if (!user) return { changed: false };
  if (user.status === status) return { changed: false };

  await prisma.user.updateMany({ where: { id: userId, workspaceId }, data: { status } });
  await audit.record({
    workspaceId, actorId: input.actorId, actorLabel: input.actorLabel, action: "user.status_changed",
    targetType: "User", targetId: userId, before: { status: user.status }, after: { status },
  });

  if (status === "ON_LEAVE" || status === "OFFLINE") {
    await handleAbsence({ workspaceId, userId });
  } else if (status === "AVAILABLE") {
    await returnFromAbsence({ workspaceId, userId });
  }
  return { changed: true, label: STATUS_LABEL[status] };
}

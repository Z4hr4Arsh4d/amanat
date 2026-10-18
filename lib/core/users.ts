// P1 owns. Rules for who may change whom (F1.2, F1.3). Enforced on the server.
import { randomBytes } from "crypto";
import type { Level } from "@prisma/client";
import { HttpError } from "./errors";
import { sha256, type Ctx } from "./session";

export const INVITE_DAYS = 7;

export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

/** Throws 403 if ctx may not edit this user at all. */
export function assertCanEditUser(ctx: Ctx, target: { id: string; level: Level }) {
  if (target.level === "OWNER" && ctx.level !== "OWNER") {
    throw new HttpError(403, "Only the Owner can change the Owner's account.");
  }
  if (ctx.level === "USER" && target.level !== "USER") {
    throw new HttpError(403, "Only the Owner or an Admin can change an Admin's account.");
  }
}

/** Only the Owner or an Admin may hand out the Admin level. */
export function assertCanGrantLevel(ctx: Ctx, level: Level) {
  if (level === "OWNER") throw new HttpError(403, "There is always exactly one Owner. This level can't be given to someone else.");
  if (level === "ADMIN" && ctx.level === "USER") throw new HttpError(403, "Only the Owner or an Admin can make someone an Admin.");
}

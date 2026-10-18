// P1 owns. F4.1–F4.3: append-only, hash-chained audit log. record()'s signature is a CONTRACT.
// Each entry stores hash = sha256(prevHash + canonicalJSON(entry)). Changing ANY old row breaks
// every hash after it, and "Verify history" finds the first broken entry. The database trigger in
// prisma/sql/audit_guard.sql also refuses UPDATE/DELETE. Uses the raw client so the worker and
// webhooks can call it (no session needed).
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

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

/** JSON with sorted keys and no undefined values, so the same data always hashes the same. */
function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === undefined ? null : x)).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

type HashFields = {
  workspaceId: string; seq: number; actorId: string | null; actorLabel: string; action: string;
  targetType: string; targetId: string | null; before: unknown; after: unknown; createdAt: Date;
};

export function computeHash(prevHash: string, f: HashFields) {
  const body = canonical({
    workspaceId: f.workspaceId, seq: f.seq, actorId: f.actorId, actorLabel: f.actorLabel, action: f.action,
    targetType: f.targetType, targetId: f.targetId, before: f.before ?? null, after: f.after ?? null, createdAt: f.createdAt,
  });
  return createHash("sha256").update(prevHash + body).digest("hex");
}

/** Append one entry. Never throws into the caller's feature; failures are logged. */
export async function record(input: AuditInput): Promise<void> {
  // Round-trip through JSON so what we hash is exactly what Postgres stores (no undefined, no Dates).
  const before = input.before === undefined || input.before === null ? null : JSON.parse(JSON.stringify(input.before));
  const after = input.after === undefined || input.after === null ? null : JSON.parse(JSON.stringify(input.after));
  const actorLabel = input.actorLabel ?? (input.actorId ? "Unknown user" : "System");
  try {
    await prisma.$transaction(async (tx) => {
      // One writer per workspace at a time, so seq and prevHash never fork (Q5).
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${input.workspaceId}::text))`;
      const last = await tx.auditLog.findFirst({
        where: { workspaceId: input.workspaceId }, orderBy: { seq: "desc" }, select: { seq: true, hash: true },
      });
      const seq = (last?.seq ?? 0) + 1;
      const prevHash = last?.hash ?? "GENESIS";
      const createdAt = new Date();
      const targetId = input.targetId ?? null;
      const hash = computeHash(prevHash, {
        workspaceId: input.workspaceId, seq, actorId: input.actorId, actorLabel, action: input.action,
        targetType: input.targetType, targetId, before, after, createdAt,
      });
      await tx.auditLog.create({
        data: {
          workspaceId: input.workspaceId, seq, actorId: input.actorId, actorLabel, action: input.action,
          targetType: input.targetType, targetId, prevHash, hash, createdAt,
          before: before === null ? Prisma.DbNull : before, after: after === null ? Prisma.DbNull : after,
        },
      });
    });
  } catch (e) {
    console.error("[audit] could not record", input.action, e);
  }
}

export type VerifyResult = {
  ok: boolean;
  checked: number;
  brokenAt?: number;
  reason?: string;
  expected?: string;
  found?: string;
};

/** Recompute every hash in order. ok=false names the first entry that was changed, removed or re-ordered. */
export async function verifyChain(workspaceId: string): Promise<VerifyResult> {
  let prev = "GENESIS";
  let expectSeq = 1;
  let checked = 0;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: { workspaceId, seq: { gte: expectSeq } }, orderBy: { seq: "asc" }, take: 1000,
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.seq !== expectSeq) {
        return { ok: false, checked, brokenAt: expectSeq, reason: `Entry #${expectSeq} is missing.` };
      }
      if (r.prevHash !== prev) {
        return { ok: false, checked, brokenAt: r.seq, reason: `Entry #${r.seq} does not link to the entry before it.`, expected: prev, found: r.prevHash };
      }
      const h = computeHash(prev, {
        workspaceId: r.workspaceId, seq: r.seq, actorId: r.actorId, actorLabel: r.actorLabel, action: r.action,
        targetType: r.targetType, targetId: r.targetId, before: r.before, after: r.after, createdAt: r.createdAt,
      });
      if (h !== r.hash) {
        return { ok: false, checked, brokenAt: r.seq, reason: `Entry #${r.seq} has been altered.`, expected: h, found: r.hash };
      }
      prev = r.hash;
      expectSeq++;
      checked++;
    }
  }
  return { ok: true, checked };
}

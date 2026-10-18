// P3 owns. Every OUTBOUND provider call goes through here → logged as an IntegrationEvent,
// retried with backoff on temporary errors, shown with a plain explanation on permanent ones (I5.4, I5.5).
// It never throws into the caller (I5.8).
//
// Retries happen in the worker (a different process), so the call must be rebuildable from the DB:
// register an executor for your job `type` with registerExecutor(), in a module that
// lib/integrations/executors.ts imports. The `run` closure is used for the first try only.
import type { Prisma, Provider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { classify, TemporaryError, PermanentError } from "./errors";
import { redact } from "./log";
import { markError, markSuccess } from "./store";

export { TemporaryError, PermanentError };

export type OutboxJob = {
  workspaceId: string;
  provider: Provider;
  type: string; // e.g. "telegram.sendMessage", "twilio.message"
  payload: Record<string, unknown>;
  /** Performs the real call. Throw TemporaryError to retry, PermanentError to stop. */
  run: () => Promise<{ externalId?: string }>;
};

export type ExecContext = { workspaceId: string; payload: Record<string, unknown>; eventId: string; attempt: number };
export type AttemptResult = {
  ok: boolean;
  final: boolean; // false = will be retried
  error?: string;
  code?: string;
  externalId?: string;
  attempts: number;
  nextAttemptAt?: Date;
};
export type Executor = {
  run: (c: ExecContext) => Promise<{ externalId?: string }>;
  /** Called after every attempt (e.g. to mark a Message or Notification as failed). Must not throw. */
  onResult?: (c: ExecContext, r: AttemptResult) => Promise<void>;
};

export const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 5_000; // 5s, 15s, 45s
const CALL_TIMEOUT_MS = 10_000;
const LEASE_MS = 30_000; // an attempt in flight "owns" the event for this long

const EXECUTORS = new Map<string, Executor>();
export function registerExecutor(type: string, ex: Executor) {
  EXECUTORS.set(type, ex);
}

export function withTimeout<T>(p: Promise<T>, ms = CALL_TIMEOUT_MS, what = "The provider"): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new TemporaryError(`${what} did not answer within ${ms / 1000}s.`, "timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

export type SendResult = { ok: boolean; error?: string; eventId?: string; externalId?: string; retrying?: boolean; code?: string };

/** CONTRACT. Log the call, try it now, and schedule retries if it fails temporarily. */
export async function send(job: OutboxJob): Promise<SendResult> {
  return createAndAttempt(job, job.run);
}

/** Same as send(), but the call is done by the executor registered for `job.type` (first try and retries). */
export async function sendRegistered(job: Omit<OutboxJob, "run">): Promise<SendResult> {
  return createAndAttempt(job, undefined);
}

async function createAndAttempt(job: Omit<OutboxJob, "run">, run: OutboxJob["run"] | undefined): Promise<SendResult> {
  let eventId: string;
  try {
    const ev = await prisma.integrationEvent.create({
      data: {
        workspaceId: job.workspaceId,
        provider: job.provider,
        direction: "OUT",
        type: job.type,
        status: "RETRYING",
        attempts: 0,
        nextAttemptAt: new Date(Date.now() + LEASE_MS),
        payload: redact(job.payload),
      },
    });
    eventId = ev.id;
  } catch (e) {
    console.error("[outbox] could not log event", e);
    return { ok: false, error: "Could not record this request. Please try again." };
  }
  return attempt({ eventId, workspaceId: job.workspaceId, provider: job.provider, type: job.type, payload: job.payload, prevAttempts: 0, run });
}

async function attempt(a: {
  eventId: string;
  workspaceId: string;
  provider: Provider;
  type: string;
  payload: Record<string, unknown>;
  prevAttempts: number;
  run?: () => Promise<{ externalId?: string }>;
}): Promise<SendResult> {
  const attempts = a.prevAttempts + 1;
  if (!EXECUTORS.has(a.type)) await import("./executors");
  const exec = EXECUTORS.get(a.type);
  const c: ExecContext = { workspaceId: a.workspaceId, payload: a.payload, eventId: a.eventId, attempt: attempts };
  const fn = a.run ?? (exec ? () => exec.run(c) : null);
  const report = async (r: AttemptResult) => {
    if (exec?.onResult) await exec.onResult(c, r).catch((e) => console.error("[outbox] onResult", a.type, e));
  };

  if (!fn) {
    const error = `No retry handler is registered for "${a.type}", so it cannot be retried.`;
    await prisma.integrationEvent.update({ where: { id: a.eventId }, data: { status: "FAILED", attempts, error, nextAttemptAt: null } }).catch(() => {});
    return { ok: false, error, eventId: a.eventId };
  }

  try {
    const res = await withTimeout(fn());
    const data: Prisma.IntegrationEventUpdateInput = { status: "SENT", attempts, error: null, nextAttemptAt: null, externalId: res.externalId ?? null };
    await prisma.integrationEvent.update({ where: { id: a.eventId }, data }).catch(async () => {
      // externalId already used by another row: keep the event, drop the reference.
      await prisma.integrationEvent.update({ where: { id: a.eventId }, data: { ...data, externalId: null } }).catch(() => {});
    });
    await markSuccess(a.workspaceId, a.provider);
    await report({ ok: true, final: true, attempts, externalId: res.externalId });
    return { ok: true, eventId: a.eventId, externalId: res.externalId };
  } catch (e) {
    const cl = classify(a.provider, e);
    await markError(a.workspaceId, a.provider, cl.message, cl.providerLevel);
    if (cl.temporary && attempts < MAX_ATTEMPTS) {
      const delay = BASE_DELAY_MS * 3 ** (attempts - 1);
      const nextAttemptAt = new Date(Date.now() + delay);
      const error = `${cl.message} Retrying automatically (try ${attempts} of ${MAX_ATTEMPTS}; next try in ${Math.round(delay / 1000)}s).`;
      await prisma.integrationEvent.update({ where: { id: a.eventId }, data: { status: "RETRYING", attempts, nextAttemptAt, error } }).catch(() => {});
      await report({ ok: false, final: false, error: cl.message, code: cl.code, attempts, nextAttemptAt });
      return { ok: false, retrying: true, error: cl.message, code: cl.code, eventId: a.eventId };
    }
    const error = cl.temporary ? `${cl.message} Gave up after ${attempts} tries.` : cl.message;
    await prisma.integrationEvent
      .update({ where: { id: a.eventId }, data: { status: "FAILED", attempts, nextAttemptAt: null, error: cl.code ? `${error} (code ${cl.code})` : error } })
      .catch(() => {});
    await report({ ok: false, final: true, error, code: cl.code, attempts });
    return { ok: false, error, code: cl.code, eventId: a.eventId };
  }
}

/**
 * Worker job: retry events whose nextAttemptAt has passed. Safe to run in two workers at once:
 * each event is claimed with a conditional update, so only one worker retries it.
 */
export async function retryDue(): Promise<void> {
  await import("./executors"); // registers P3's executors (and any others listed there)
  const now = new Date();
  const due = await prisma.integrationEvent.findMany({
    where: { direction: "OUT", status: "RETRYING", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: 20,
  });
  for (const ev of due) {
    const { count } = await prisma.integrationEvent.updateMany({
      where: { id: ev.id, status: "RETRYING", attempts: ev.attempts, nextAttemptAt: ev.nextAttemptAt },
      data: { nextAttemptAt: new Date(Date.now() + LEASE_MS) },
    });
    if (count === 0) continue; // another worker took it
    await attempt({
      eventId: ev.id,
      workspaceId: ev.workspaceId,
      provider: ev.provider,
      type: ev.type,
      payload: (ev.payload ?? {}) as Record<string, unknown>,
      prevAttempts: ev.attempts,
    });
  }
}

/** Manually retry one FAILED event (used by the Retry buttons). Returns false if it is not retryable. */
export async function retryNow(eventId: string, workspaceId: string): Promise<SendResult> {
  await import("./executors");
  const ev = await prisma.integrationEvent.findFirst({ where: { id: eventId, workspaceId, direction: "OUT" } });
  if (!ev || ev.status !== "FAILED") return { ok: false, error: "This item is not waiting for a retry." };
  const { count } = await prisma.integrationEvent.updateMany({
    where: { id: ev.id, status: "FAILED" },
    data: { status: "RETRYING", nextAttemptAt: new Date(Date.now() + LEASE_MS) },
  });
  if (count === 0) return { ok: false, error: "Someone else is already retrying this." };
  return attempt({ eventId: ev.id, workspaceId, provider: ev.provider, type: ev.type, payload: (ev.payload ?? {}) as Record<string, unknown>, prevAttempts: 0 });
}

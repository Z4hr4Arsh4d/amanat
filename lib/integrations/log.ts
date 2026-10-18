// P3 owns. Synchronization history (I5.4): every inbound webhook and outbound call is one IntegrationEvent.
// Payloads are redacted before they are stored, so no secret or card-like number ever lands in the log (I2.8, I5.3).
import { Prisma, type Direction, type EventStatus, type Provider } from "@prisma/client";
import { prisma } from "@/lib/db";

const SECRET_KEYS = /(auth|token|secret|password|signature|api[_-]?key|authorization|cookie|whsec|sk_|client_secret|refresh|access_token|card|cvc|cvv|exp_|number_last|iban)/i;
const CARD_LIKE = /\b(?:\d[ -]?){13,19}\b/g;

function luhn(digits: string) {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Deep-copies a value, replacing secret-looking keys and card-like digit runs. */
export function redact(value: unknown, depth = 0): Prisma.InputJsonValue {
  if (depth > 6) return "[…]";
  if (value == null) return null as unknown as Prisma.InputJsonValue;
  if (typeof value === "string") {
    const s = value.replace(CARD_LIKE, (m: string, offset: number, all: string) =>
      all[offset - 1] !== "+" && luhn(m.replace(/\D/g, "")) ? "[redacted number]" : m,
    );
    return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export type LogInput = {
  workspaceId: string;
  provider: Provider;
  direction: Direction;
  type: string;
  externalId?: string | null;
  status: EventStatus;
  payload?: unknown;
  error?: string | null;
  attempts?: number;
  nextAttemptAt?: Date | null;
};

/** Writes one IntegrationEvent. Never throws (logging must not break the caller, I5.8). */
export async function logEvent(input: LogInput) {
  try {
    return await prisma.integrationEvent.create({
      data: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        direction: input.direction,
        type: input.type,
        externalId: input.externalId ?? null,
        status: input.status,
        payload: redact(input.payload ?? {}),
        error: input.error ?? null,
        attempts: input.attempts ?? 0,
        nextAttemptAt: input.nextAttemptAt ?? null,
      },
    });
  } catch (e) {
    console.error("[integrations.log] could not write event", input.type, (e as Error).message);
    return null;
  }
}

/**
 * Inserts the event that "claims" an inbound webhook (dedupe on provider + externalId).
 * Returns the event, or `null` if this externalId was already processed (a duplicate delivery).
 * A previously FAILED event is re-claimed so a provider retry can finish the job (nothing silently lost).
 */
export async function claimInbound(input: Omit<LogInput, "status" | "direction"> & { externalId: string }) {
  try {
    return await prisma.integrationEvent.create({
      data: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        direction: "IN",
        type: input.type,
        externalId: input.externalId,
        status: "RECEIVED",
        attempts: 1,
        payload: redact(input.payload ?? {}),
      },
    });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    const existing = await prisma.integrationEvent.findUnique({
      where: { provider_externalId: { provider: input.provider, externalId: input.externalId } },
    });
    if (existing && existing.status === "FAILED") {
      const { count } = await prisma.integrationEvent.updateMany({
        where: { id: existing.id, status: "FAILED" },
        data: { status: "RECEIVED", attempts: { increment: 1 }, error: null },
      });
      if (count === 1) return existing;
    }
    return null;
  }
}

export async function finishEvent(id: string, status: EventStatus, error?: string | null, payload?: unknown) {
  await prisma.integrationEvent
    .update({ where: { id }, data: { status, error: error ?? null, ...(payload !== undefined ? { payload: redact(payload) } : {}) } })
    .catch((e) => console.error("[integrations.log] finishEvent", e.message));
}

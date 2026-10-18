// P3 owns. STUB. Every OUTBOUND provider call goes through here → logged in IntegrationEvent,
// retried with backoff on temporary errors, shown with a plain explanation on permanent ones (I5.4, I5.5).
import type { Provider } from "@prisma/client";

export type OutboxJob = {
  workspaceId: string;
  provider: Provider;
  type: string; // e.g. "telegram.sendMessage", "twilio.message"
  payload: Record<string, unknown>;
  /** Performs the real call. Throw TemporaryError to retry, PermanentError to stop. */
  run: () => Promise<{ externalId?: string }>;
};

export class TemporaryError extends Error {}
export class PermanentError extends Error {}

export async function send(job: OutboxJob): Promise<{ ok: boolean; error?: string }> {
  try {
    await job.run();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Worker job: retry due RETRYING events. */
export async function retryDue(): Promise<void> {}

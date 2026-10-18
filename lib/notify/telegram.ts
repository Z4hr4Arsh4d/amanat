// P2 owns. Minimal Telegram Bot API client using plain fetch (PLAN.md §3.8). No new packages.
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/integrations/secrets";

export class TgError extends Error {
  constructor(message: string, public permanent: boolean, public status?: number) {
    super(message);
  }
}

/** Plain-language explanation for Telegram's errors (I4.4). Never includes the bot token. */
function explain(status: number, description: string | undefined): string {
  if (status === 401) return "The Telegram bot token is wrong or was revoked. Reconnect Telegram on the Integrations page.";
  if (status === 403) return "This person has blocked the bot or has not pressed Start on it yet. Ask them to open the bot and press Start.";
  if (status === 429) return "Telegram asked us to slow down. We will try again shortly.";
  if (status >= 500) return "Telegram is having problems right now. We will try again shortly.";
  if (status === 400 && /chat not found/i.test(description ?? "")) return "Telegram could not find this chat. Ask the person to press Start on the bot again.";
  return `Telegram refused the message${description ? `: ${description}` : "."}`;
}

export async function tgCall<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const ctrl = new AbortController();
  const abort = setTimeout(() => ctrl.abort(), 10_000); // network timeout only, not a business timer
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
    });
  } catch {
    throw new TgError("Could not reach Telegram. We will try again shortly.", false);
  } finally {
    clearTimeout(abort);
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!res.ok || !json?.ok) {
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw new TgError(explain(res.status, json?.description), permanent, res.status);
  }
  return json.result as T;
}

export type TelegramConn = { integrationId: string; token: string; secret: string; botUsername: string | null };

/** The workspace's connected Telegram bot, or null. Secrets are decrypted here, on the server only (I5.3). */
export async function getTelegram(workspaceId: string): Promise<TelegramConn | null> {
  const row = await prisma.integration.findFirst({ where: { workspaceId, provider: "TELEGRAM", status: { not: "NOT_CONNECTED" } } });
  if (!row?.secrets) return null;
  try {
    const s = decryptJson<{ botToken: string; webhookSecret: string }>(row.secrets);
    const cfg = (row.publicConfig ?? {}) as { botUsername?: string };
    return { integrationId: row.id, token: s.botToken, secret: s.webhookSecret, botUsername: cfg.botUsername ?? null };
  } catch {
    return null;
  }
}

/** Record whether the last call worked, for the Integrations page (I5.1). Best effort. */
export async function markIntegration(integrationId: string, ok: boolean, error?: string): Promise<void> {
  try {
    await prisma.integration.update({
      where: { id: integrationId },
      data: ok ? { status: "CONNECTED", lastSuccessAt: new Date(), lastError: null } : { status: "ERROR", lastError: error ?? "Unknown error" },
    });
  } catch {
    // never let bookkeeping break a send
  }
}

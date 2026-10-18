// P3 owns. Loading a workspace's integration + its decrypted secrets (server only).
// Always looked up by (workspaceId, provider) or by integration id, so one workspace's
// credentials are never used for another (I5.2).
import type { Integration, Provider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptJson } from "./secrets";

export type TwilioSecrets = { accountSid: string; authToken: string };
export type TwilioConfig = { fromNumber: string; joinCode?: string; accountSidMasked?: string; authTokenMasked?: string };
export type StripeSecrets = { secretKey: string; webhookSecret: string };
export type StripeConfig = { secretKeyMasked?: string; webhookSecretMasked?: string };

/** Public base URL. Webhook signatures are computed over this exact URL, so it must match what the provider calls. */
export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function webhookUrl(provider: "twilio" | "stripe" | "telegram", integrationId: string, suffix = "") {
  return `${appUrl()}/api/webhooks/${provider}/${integrationId}${suffix}`;
}

export async function getIntegration(workspaceId: string, provider: Provider) {
  return prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider } } });
}

/** Decrypts secrets; returns null if missing or unreadable (e.g. ENCRYPTION_KEY changed). */
export function readSecrets<T>(i: Pick<Integration, "secrets"> | null): T | null {
  if (!i?.secrets) return null;
  try {
    return decryptJson<T>(i.secrets) as T;
  } catch {
    return null;
  }
}

export async function connected<S, C = Record<string, unknown>>(workspaceId: string, provider: Provider) {
  const i = await getIntegration(workspaceId, provider);
  if (!i || i.status === "NOT_CONNECTED") return null;
  const secrets = readSecrets<S>(i);
  if (!secrets) return null;
  return { integration: i, secrets, config: (i.publicConfig ?? {}) as C };
}

/** The provider worked: record when, and clear an ERROR status. Never throws. */
export async function markSuccess(workspaceId: string, provider: Provider) {
  await prisma.integration
    .updateMany({
      where: { workspaceId, provider, status: { not: "NOT_CONNECTED" } },
      data: { status: "CONNECTED", lastSuccessAt: new Date(), lastError: null },
    })
    .catch(() => {});
}

/** The provider failed. Integration-wide problems (bad key, provider down) set status ERROR. Never throws. */
export async function markError(workspaceId: string, provider: Provider, message: string, providerLevel: boolean) {
  await prisma.integration
    .updateMany({
      where: { workspaceId, provider, status: { not: "NOT_CONNECTED" } },
      data: { lastError: message.slice(0, 500), ...(providerLevel ? { status: "ERROR" } : {}) },
    })
    .catch(() => {});
}

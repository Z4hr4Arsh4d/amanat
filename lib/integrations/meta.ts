// P3 owns. WhatsApp Cloud API (Meta) — the free alternative to Twilio (I1).
// Free: Meta developer account + free test number; incoming messages and replies within 24h are free.
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { PermanentError, registerExecutor } from "./outbox";
import { connected, type MetaConfig, type MetaSecrets } from "./store";
import { STATUS_MAP } from "./status";

export const GRAPH = "https://graph.facebook.com/v23.0";

/** Error thrown for Graph API failures; classify() reads `status` and `code`. */
export class MetaApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function graph<T>(path: string, token: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(`${GRAPH}/${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = j?.error ?? {};
    const detail = e.error_data?.details ? ` (${e.error_data.details})` : "";
    throw new MetaApiError(`${e.message ?? `HTTP ${r.status}`}${detail}`, r.status, e.code != null ? String(e.code) : undefined);
  }
  return j as T;
}

/** One call to prove the Phone number ID + token work. */
export async function verifyMetaCredentials(phoneNumberId: string, accessToken: string) {
  return graph<{ display_phone_number?: string; verified_name?: string; id: string }>(
    `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, accessToken,
  );
}

/** I1.2: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
export function validMetaSignature(appSecret: string, header: string | null, rawBody: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The token Meta sends back when you register the webhook. Made by Amanat per integration, not a Meta secret. */
export function metaVerifyToken(integrationId: string) {
  const key = process.env.ENCRYPTION_KEY ?? "";
  return "amanat-" + createHmac("sha256", key).update(`meta-verify:${integrationId}`).digest("hex").slice(0, 24);
}

// ── Outbox executor: "meta.message" (payload: { messageId }) ──
registerExecutor("meta.message", {
  async run({ workspaceId, payload }) {
    const messageId = String(payload.messageId ?? "");
    const msg = await prisma.message.findFirst({ where: { id: messageId, workspaceId }, include: { conversation: { include: { contact: true } } } });
    if (!msg) throw new PermanentError("The message no longer exists.", "missing");
    if (msg.providerSid) return { externalId: msg.providerSid }; // already accepted by WhatsApp: never send twice
    const contact = msg.conversation.contact;
    if (contact.optedOut) throw new PermanentError(`${contact.name} opted out, so messages are blocked to respect their choice.`, "opted_out");
    if (!contact.phone) throw new PermanentError(`${contact.name} has no phone number. Add one on the contact page.`, "no_phone");
    const conn = await connected<MetaSecrets, MetaConfig>(workspaceId, "META");
    if (!conn) throw new PermanentError("WhatsApp is not connected. An admin can connect it on the Integrations page.", "not_connected");

    const res = await graph<{ messages?: { id: string; message_status?: string }[] }>(`${conn.config.phoneNumberId}/messages`, conn.secrets.accessToken, {
      method: "POST",
      body: { messaging_product: "whatsapp", recipient_type: "individual", to: contact.phone.replace(/^\+/, ""), type: "text", text: { preview_url: false, body: msg.body } },
    });
    const wamid = res.messages?.[0]?.id;
    if (!wamid) throw new PermanentError("WhatsApp did not return a message id.", "no_id");
    const mapped = STATUS_MAP[res.messages?.[0]?.message_status ?? "queued"] ?? STATUS_MAP.queued;
    await prisma.message.updateMany({
      where: { id: msg.id, workspaceId, providerSid: null },
      data: { providerSid: wamid, status: mapped.status === "FAILED" ? "QUEUED" : mapped.status, errorCode: null, errorReason: null },
    });
    return { externalId: wamid };
  },
  async onResult({ workspaceId, payload }, r) {
    if (r.ok) return;
    await prisma.message.updateMany({
      where: { id: String(payload.messageId ?? ""), workspaceId, providerSid: null },
      data: r.final
        ? { status: "FAILED", errorCode: r.code ?? null, errorReason: r.error ?? "Sending failed." }
        : { status: "QUEUED", errorCode: r.code ?? null, errorReason: `Delayed: ${r.error} Retrying automatically.` },
    });
  },
});

// P3 owns. WhatsApp Cloud API (Meta) webhook. Order: verify X-Hub-Signature-256 → dedupe → process → log.
import { prisma } from "@/lib/db";
import { readSecrets, type MetaConfig, type MetaSecrets } from "./store";
import { metaVerifyToken, validMetaSignature } from "./meta";
import { toE164 } from "./phone";
import { applyStatus, receiveMessage, rejectWebhook } from "./inbound";
import { logEvent } from "./log";

/** GET: Meta calls this once when you save the webhook in the Meta app (hub.challenge handshake). */
export async function handleMetaVerify(req: Request, integrationId: string) {
  const i = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!i || i.provider !== "META") return new Response("Unknown webhook", { status: 404 });
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === metaVerifyToken(i.id)) {
    await logEvent({ workspaceId: i.workspaceId, provider: "META", direction: "IN", type: "webhook.verified", status: "PROCESSED", payload: { mode: "subscribe" } });
    return new Response(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  await rejectWebhook(i, "META", "webhook.verify", "Wrong verify token", { mode: q.get("hub.mode") });
  return new Response("Wrong verify token", { status: 403 });
}

type WaValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: { from: string; id: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; image?: unknown; document?: unknown; audio?: unknown; video?: unknown; sticker?: unknown }[];
  statuses?: { id: string; status: string; recipient_id?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] }[];
};

/** POST: incoming messages and delivery statuses. Meta retries anything that is not 200. */
export async function handleMetaWebhook(req: Request, integrationId: string) {
  const i = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!i || i.provider !== "META") return new Response("Unknown webhook", { status: 404 });
  const raw = await req.text(); // raw body: the signature is over these exact bytes
  const secrets = readSecrets<MetaSecrets>(i);
  const sig = req.headers.get("x-hub-signature-256");
  const why = i.status === "NOT_CONNECTED" || !secrets
    ? "WhatsApp (Meta) is not connected for this workspace"
    : !sig ? "Missing X-Hub-Signature-256 header" : !validMetaSignature(secrets.appSecret, sig, raw) ? "Invalid signature" : null;
  if (why) {
    await rejectWebhook(i, "META", "message.inbound", why, { bytes: raw.length, ip: req.headers.get("x-forwarded-for") });
    return new Response(why, { status: 403 });
  }

  let body: { entry?: { changes?: { field?: string; value?: WaValue }[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    await logEvent({ workspaceId: i.workspaceId, provider: "META", direction: "IN", type: "message.inbound", status: "REJECTED", error: "Body is not valid JSON." });
    return new Response("Bad JSON", { status: 400 });
  }
  const cfg = (i.publicConfig ?? {}) as Partial<MetaConfig>;
  let retry = false;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field !== "messages" || !v) continue;
      // I5.2: only accept events for this workspace's own phone number.
      if (cfg.phoneNumberId && v.metadata?.phone_number_id && v.metadata.phone_number_id !== cfg.phoneNumberId) {
        await logEvent({ workspaceId: i.workspaceId, provider: "META", direction: "IN", type: "message.inbound", status: "REJECTED", error: `Event for another phone number (${v.metadata.phone_number_id}); ignored.` });
        continue;
      }
      for (const m of v.messages ?? []) {
        const from = toE164(`+${m.from}`);
        if (!from) continue;
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
        const media = m.image || m.document || m.audio || m.video || m.sticker ? 1 : 0;
        const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
        const r = await receiveMessage(i, "META", { externalId: m.id, from, body: text, mediaCount: media, profileName: name, raw: { ...m, profileName: name } });
        if (r === "failed") retry = true;
      }
      for (const s of v.statuses ?? []) {
        const err = s.errors?.[0];
        const r = await applyStatus(i, "META", {
          providerSid: s.id, status: s.status, errorCode: err?.code != null ? String(err.code) : null,
          errorMessage: err ? `${err.title ?? err.message ?? ""}${err.error_data?.details ? ` (${err.error_data.details})` : ""}` : null, raw: s,
        });
        if (r === "retry") retry = true;
      }
    }
  }
  return new Response(retry ? "retry" : "ok", { status: retry ? 500 : 200 });
}

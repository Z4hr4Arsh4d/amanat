// P3 owns. Twilio webhooks: verify X-Twilio-Signature, then hand over to the shared inbound logic.
// Order is always: verify signature → dedupe → process → log. No data changes before the signature passes.
import type { Integration } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logEvent } from "./log";
import { readSecrets, webhookUrl, type TwilioSecrets } from "./store";
import { validTwilioSignature } from "./twilio";
import { toE164 } from "./phone";
import { applyStatus, receiveMessage, rejectWebhook } from "./inbound";

export const twiml = (status = 200) =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', { status, headers: { "Content-Type": "text/xml" } });

type Verified = { ok: true; integration: Integration; params: Record<string, string> } | { ok: false; response: Response };

/** Loads the integration named in the URL and checks X-Twilio-Signature against this workspace's Auth Token (I1.2, I5.2). */
export async function verifyTwilioRequest(req: Request, integrationId: string, suffix: string, eventType: string): Promise<Verified> {
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!integration || integration.provider !== "TWILIO") return { ok: false, response: new Response("Unknown webhook", { status: 404 }) };

  const form = await req.formData().catch(() => null);
  const params: Record<string, string> = {};
  form?.forEach((v, k) => { if (typeof v === "string") params[k] = v; });

  const secrets = readSecrets<TwilioSecrets>(integration);
  const url = webhookUrl("twilio", integration.id, suffix) + new URL(req.url).search; // the query is part of the signed URL
  const signature = req.headers.get("x-twilio-signature");
  const why = integration.status === "NOT_CONNECTED" || !secrets
    ? "Twilio is not connected for this workspace"
    : !signature ? "Missing X-Twilio-Signature header" : !validTwilioSignature(secrets.authToken, signature, url, params) ? "Invalid signature" : null;
  if (why) {
    await rejectWebhook(integration, "TWILIO", eventType, why, { claimedMessageSid: params.MessageSid, from: params.From, url, ip: req.headers.get("x-forwarded-for") });
    return { ok: false, response: new Response(why, { status: 403 }) };
  }
  return { ok: true, integration, params };
}

export async function handleInbound(integration: Integration, p: Record<string, string>): Promise<Response> {
  const sid = p.MessageSid || p.SmsMessageSid;
  const from = toE164(p.From);
  if (!sid || !from) {
    await logEvent({ workspaceId: integration.workspaceId, provider: "TWILIO", direction: "IN", type: "message.inbound", status: "REJECTED", error: !sid ? "No MessageSid in the request." : `Could not read the sender's phone number ("${p.From}").`, payload: p });
    return twiml();
  }
  const r = await receiveMessage(integration, "TWILIO", { externalId: sid, from, body: p.Body ?? "", mediaCount: Number(p.NumMedia ?? 0), profileName: p.ProfileName, raw: p });
  return twiml(r === "failed" ? 500 : 200);
}

export async function handleStatus(integration: Integration, p: Record<string, string>, messageIdHint: string | null): Promise<Response> {
  const sid = p.MessageSid || p.SmsSid;
  if (!sid) return new Response(null, { status: 204 });
  const r = await applyStatus(integration, "TWILIO", {
    providerSid: sid, status: p.MessageStatus || p.SmsStatus || "", errorCode: p.ErrorCode || null, errorMessage: p.ErrorMessage || null, messageIdHint, raw: p,
  });
  return new Response(null, { status: r === "retry" ? 500 : 204 });
}

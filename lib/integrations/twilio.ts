// P3 owns. Twilio WhatsApp: client, credential check, and the outbox executor for sending (I1.3, I1.7).
import twilio from "twilio";
import { prisma } from "@/lib/db";
import { PermanentError, registerExecutor } from "./outbox";
import { connected, webhookUrl, type TwilioConfig, type TwilioSecrets } from "./store";
import { whatsappAddress } from "./phone";
import { STATUS_MAP } from "./status";

export function twilioClient(s: TwilioSecrets) {
  return twilio(s.accountSid, s.authToken, { timeout: 10_000, autoRetry: false });
}

/** Calls Twilio once to prove the credentials work. Throws the Twilio error otherwise. */
export async function verifyTwilioCredentials(s: TwilioSecrets) {
  const acct = await twilioClient(s).api.v2010.accounts(s.accountSid).fetch();
  return { friendlyName: acct.friendlyName, type: acct.type, status: acct.status };
}

/** I1.2: true only if the request was signed by Twilio with this workspace's Auth Token over this exact URL. */
export function validTwilioSignature(authToken: string, signature: string | null, url: string, params: Record<string, string>) {
  if (!signature) return false;
  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}

export { STATUS_MAP } from "./status";

// ── Outbox executor: "twilio.message" (payload: { messageId }) ──
// The message text is read from the Message row, so a retry in the worker sends exactly what the employee wrote.
registerExecutor("twilio.message", {
  async run({ workspaceId, payload }) {
    const messageId = String(payload.messageId ?? "");
    const msg = await prisma.message.findFirst({
      where: { id: messageId, workspaceId },
      include: { conversation: { include: { contact: true } } },
    });
    if (!msg) throw new PermanentError("The message no longer exists.", "missing");
    if (msg.providerSid) return { externalId: msg.providerSid }; // already handed to Twilio: never send twice
    const contact = msg.conversation.contact;
    if (contact.optedOut) throw new PermanentError(`${contact.name} opted out, so messages are blocked to respect their choice.`, "opted_out");
    if (!contact.phone) throw new PermanentError(`${contact.name} has no phone number. Add one on the contact page.`, "no_phone");

    const conn = await connected<TwilioSecrets, TwilioConfig>(workspaceId, "TWILIO");
    if (!conn) throw new PermanentError("WhatsApp is not connected. An admin can connect Twilio on the Integrations page.", "not_connected");

    const sent = await twilioClient(conn.secrets).messages.create({
      from: conn.config.fromNumber,
      to: whatsappAddress(contact.phone),
      body: msg.body,
      statusCallback: webhookUrl("twilio", conn.integration.id, `/status?m=${msg.id}`),
    });
    const mapped = STATUS_MAP[sent.status] ?? STATUS_MAP.queued;
    await prisma.message.updateMany({
      where: { id: msg.id, workspaceId, providerSid: null },
      data: { providerSid: sent.sid, status: mapped.status === "FAILED" ? "FAILED" : mapped.status, errorCode: null, errorReason: null },
    });
    return { externalId: sent.sid };
  },
  async onResult({ workspaceId, payload }, r) {
    if (r.ok) return;
    const messageId = String(payload.messageId ?? "");
    await prisma.message.updateMany({
      where: { id: messageId, workspaceId, providerSid: null },
      data: r.final
        ? { status: "FAILED", errorCode: r.code ?? null, errorReason: r.error ?? "Sending failed." }
        : { status: "QUEUED", errorCode: r.code ?? null, errorReason: `Delayed: ${r.error} Retrying automatically.` },
    });
  },
});

// P3 owns. Turns provider errors into (a) temporary vs permanent and (b) a plain sentence
// a non-technical employee can act on (I5.5).
import type { Provider } from "@prisma/client";

/** Throw from an outbox executor to say "try again later". */
export class TemporaryError extends Error {
  constructor(message: string, public code?: string | number) {
    super(message);
  }
}
/** Throw from an outbox executor to say "retrying will not help". */
export class PermanentError extends Error {
  constructor(message: string, public code?: string | number) {
    super(message);
  }
}

const TWILIO: Record<string, string> = {
  "20003": "Twilio rejected the Account SID or Auth Token. An admin should check them on the Integrations page.",
  "20404": "Twilio could not find this resource. Check the Account SID and WhatsApp number on the Integrations page.",
  "20429": "Twilio is receiving too many requests.",
  "21211": "This phone number is not valid. Check the contact's phone number (it must include the country code, e.g. +92…).",
  "21408": "Your Twilio account is not allowed to send to this country. Enable it in Twilio's Geo Permissions.",
  "21606": "The WhatsApp sender number is not valid for this account. Check the sandbox number on the Integrations page.",
  "21608": "Twilio trial accounts can only send to verified numbers. Verify this number in Twilio or upgrade the account.",
  "21610": "This customer replied STOP to Twilio, so Twilio blocks messages to them.",
  "21614": "This number cannot receive messages (it is not a mobile number).",
  "21617": "The message is too long. Shorten it and try again.",
  "63003": "WhatsApp could not reach this number. The customer may not use WhatsApp.",
  "63007": "Twilio could not find the WhatsApp sender. Check the sandbox number on the Integrations page.",
  "63015": "This phone has not joined the sandbox. Ask the customer to send 'join <your code>' to the sandbox number first.",
  "63016": "This customer has not messaged in the last 24 hours, so WhatsApp only allows template messages. Ask them to message you first.",
  "63018": "WhatsApp rate limit reached.",
  "63024": "WhatsApp says this recipient is not valid. Check the phone number.",
  "63032": "The customer's WhatsApp could not accept the message. Try again later.",
  "30003": "The customer's phone is switched off or unreachable. Try again later.",
  "30005": "The customer's number does not exist or is not in service.",
  "30006": "This is a landline or the carrier cannot receive messages.",
  "30007": "The carrier filtered this message as spam. Change the wording and try again.",
  "30008": "The message could not be delivered for an unknown reason. Try again later.",
};

const TELEGRAM: Record<string, string> = {
  "401": "Telegram rejected the bot token. An admin should paste a new token on the Integrations page.",
  "403": "This employee blocked the bot or never pressed Start. Ask them to open the bot and press Start.",
  "400": "Telegram could not find this chat. Ask the employee to connect Telegram again from their profile.",
  "429": "Telegram is rate limiting the bot.",
};

const STRIPE: Record<string, string> = {
  authentication_error: "Stripe rejected the secret key. An admin should check it on the Integrations page.",
  rate_limit_error: "Stripe is receiving too many requests.",
  api_connection_error: "Could not reach Stripe.",
  invalid_request_error: "Stripe did not accept this request. Check the amount and currency.",
  permission_error: "This Stripe key is not allowed to do that. Use a standard test secret key.",
  resource_missing: "Stripe could not find this payment. It may have been created in another Stripe account.",
};

const META: Record<string, string> = {
  "190": "Meta rejected the access token (it may have expired; tokens from the API Setup page last 24 hours). An admin should paste a new token on the Integrations page.",
  "10": "This access token is missing WhatsApp permissions. Create it with whatsapp_business_messaging and whatsapp_business_management.",
  "100": "Meta did not accept this request. Check the Phone number ID on the Integrations page.",
  "131030": "This phone is not on the test number's allowed list. Add it in the Meta app → WhatsApp → API Setup → “To” numbers (up to 5).",
  "131047": "This customer has not messaged in the last 24 hours, so WhatsApp only allows template messages. Ask them to message you first.",
  "131026": "WhatsApp could not deliver this message. The number may not use WhatsApp, or the customer must accept the latest WhatsApp terms.",
  "131021": "The sender and the recipient are the same number.",
  "131049": "WhatsApp chose not to deliver this message to keep the customer's experience healthy. Try again later.",
  "131051": "This message type is not supported.",
  "131056": "Too many messages to this customer in a short time. Retrying shortly.",
  "130429": "WhatsApp rate limit reached. Retrying shortly.",
  "131000": "WhatsApp had an unknown problem sending this message. Try again.",
  "131016": "WhatsApp is temporarily unavailable. Retrying shortly.",
  "133010": "This phone number is not registered with WhatsApp Cloud API yet. Finish setup in the Meta app.",
  "368": "Meta temporarily blocked this account for policy reasons. Check the Meta Business account.",
};

const GOOGLE: Record<string, string> = {
  invalid_grant: "Google Calendar access was revoked or expired. The employee must reconnect on My calendar.",
  "401": "Google Calendar access expired. The employee must reconnect on My calendar.",
  "403": "Google refused access to this calendar. Reconnect and allow calendar access.",
  "429": "Google is rate limiting requests.",
};

function tableFor(provider: Provider) {
  return provider === "TWILIO" ? TWILIO : provider === "TELEGRAM" ? TELEGRAM : provider === "STRIPE" ? STRIPE : provider === "META" ? META : GOOGLE;
}
export const hasExplanation = (provider: Provider, code?: string | number | null) => code != null && String(code) in tableFor(provider);

/** Plain explanation for a provider error code; falls back to the raw message. */
export function explainError(provider: Provider, code?: string | number | null, fallback?: string): string {
  const table = tableFor(provider);
  const hit = code != null ? table[String(code)] : undefined;
  if (hit) return hit;
  if (fallback) return `${provider[0]}${provider.slice(1).toLowerCase()} said: ${fallback}`;
  return "The provider rejected the request. Check the details and try again.";
}

const NETWORK_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]);
const TEMP_PROVIDER_CODES = new Set(["20429", "63018", "rate_limit_error", "api_connection_error", "lock_timeout", "130429", "131056", "131016", "80007", "4", "2"]);

export type Classified = { temporary: boolean; code?: string; message: string; providerLevel: boolean };

/**
 * Decide whether an error is worth retrying, and whether it means the whole integration is broken
 * (bad credentials / provider down) rather than just this one message.
 */
export function classify(provider: Provider, e: unknown): Classified {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = (e ?? {}) as any;
  if (e instanceof TemporaryError) return { temporary: true, code: e.code?.toString(), message: e.message, providerLevel: true };
  if (e instanceof PermanentError) {
    const code = e.code?.toString();
    // Our own PermanentErrors already carry a plain sentence; provider codes get the table's explanation.
    return { temporary: false, code, message: hasExplanation(provider, code) ? explainError(provider, code) : e.message, providerLevel: isAuthCode(code) };
  }
  const status: number | undefined = err.status ?? err.statusCode ?? err.response?.status;
  const code: string | undefined = (err.code ?? err.type ?? err.raw?.code)?.toString();
  const cause = err.cause?.code?.toString();

  if (err.name === "AbortError" || err.name === "TimeoutError" || NETWORK_CODES.has(code ?? "") || NETWORK_CODES.has(cause ?? "")) {
    return { temporary: true, code: code ?? cause, message: `Could not reach ${nice(provider)} (network problem or timeout).`, providerLevel: true };
  }
  if (status === 429 || (status && status >= 500) || TEMP_PROVIDER_CODES.has(code ?? "")) {
    return { temporary: true, code: code ?? String(status), message: explainError(provider, code ?? status, `${nice(provider)} is having trouble (${status ?? code}).`), providerLevel: true };
  }
  const authLike = status === 401 || isAuthCode(code);
  return {
    temporary: false,
    code: code ?? (status ? String(status) : undefined),
    message: explainError(provider, code ?? status, err.message ?? String(e)),
    providerLevel: authLike,
  };
}

function isAuthCode(code?: string) {
  return code === "20003" || code === "authentication_error" || code === "invalid_grant" || code === "401" || code === "190";
}

export const nice = (p: Provider) =>
  p === "TWILIO" ? "Twilio" : p === "STRIPE" ? "Stripe" : p === "GOOGLE" ? "Google" : p === "META" ? "WhatsApp (Meta)" : "Telegram";

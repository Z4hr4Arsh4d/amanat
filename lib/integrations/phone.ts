// P3 owns. Phone helpers for WhatsApp addresses. Contacts store phones in E.164 (+923001234567).

/** "whatsapp:+92 300-1234567" → "+923001234567"; returns null if it is not a usable international number. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^whatsapp:/i, "").replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!s.startsWith("+")) return null;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export const whatsappAddress = (e164: string) => `whatsapp:${e164}`;

/** "+923001234567" → "+92 300 •••4567" for places where the full number is not needed. */
export function shortPhone(e164?: string | null) {
  if (!e164) return "";
  return `${e164.slice(0, 3)} ${e164.slice(3, 6)} •••${e164.slice(-4)}`;
}

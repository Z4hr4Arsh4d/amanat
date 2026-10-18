// P1 owns. Phones are stored in E.164 (+923001234567) so P3 can match WhatsApp senders (F2.1).
// Default country is Pakistan: "0300 1234567" → "+923001234567".
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  let digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (digits.startsWith("+")) digits = "+" + digits.slice(1).replace(/\+/g, "");
  else if (digits.startsWith("0")) digits = "+92" + digits.slice(1);
  else if (digits.startsWith("92") && digits.length >= 12) digits = "+" + digits;
  else digits = "+" + digits;
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : "INVALID";
}

// P3 owns. AES-256-GCM encryption for API keys / tokens stored in the DB (I5.3).
// Never return decrypted values to the browser; show mask() instead.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key() {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY is not set (see .env.example)");
  return createHash("sha256").update(k).digest(); // 32 bytes
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

export const encryptJson = (o: unknown) => encrypt(JSON.stringify(o));
export const decryptJson = <T = Record<string, string>>(blob: string) => JSON.parse(decrypt(blob)) as T;

/** "sk_test_51Habc...xyz9" → "sk_test_••••xyz9" */
export function mask(secret?: string | null) {
  if (!secret) return "";
  const prefix = secret.match(/^(sk_test_|sk_live_|whsec_|AC)/)?.[0] ?? "";
  return `${prefix}••••${secret.slice(-4)}`;
}

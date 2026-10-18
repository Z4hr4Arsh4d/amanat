// P3 owns. The worker runs under plain `tsx`, which (unlike Next.js) does not read .env. Load it once if needed.
let tried = false;
export function ensureEnv() {
  if (tried) return;
  tried = true;
  if (process.env.ENCRYPTION_KEY && process.env.ABANDON_SECONDS) return;
  if (typeof process.loadEnvFile !== "function") return;
  try { process.loadEnvFile(".env"); } catch { /* no .env file: callers fall back to defaults or explain */ }
}

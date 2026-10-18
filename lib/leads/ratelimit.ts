// P2 owns. Simple per-key limiter for the public form (5 per minute per IP).
// Kept in memory on purpose: it only slows abuse, and nothing depends on it surviving a restart.
const hits = new Map<string, number[]>();

export function rateLimited(key: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return false;
}

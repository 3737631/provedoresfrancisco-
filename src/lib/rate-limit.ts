// Rate limiting simple en memoria (una instancia). Por IP para /api/analyze
// y /api/capture: 6 peticiones / minuto. Suficiente para uso personal; si el
// proyecto migra a multiples instancias, mover esto a una tabla compartida.
const buckets = new Map<string, { count: number; resetAt: number }>();

const MAX = 6;
const WINDOW_MS = 60_000;

export function rateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const key = ip || "unknown";
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (b.count >= MAX) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { allowed: true };
}

// Limpia buckets viejos de vez en cuando para no crecer sin limite.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 5 * 60_000).unref();
/**
 * Cubetas de tokens (token bucket) en memoria. Código puro, sin dependencias.
 * Cada petición consume 1 token; la cubeta se rellena con el tiempo. Permite ráfagas cortas legítimas
 * (varias pestañas, doble clic) pero corta el tráfico sostenido. JS es monohilo: comprobar y consumir es atómico.
 * Limitación: el estado vive en un proceso; con varias instancias hay que moverlo a Redis.
 */
export interface Rule { capacity: number; refillPerSec: number }
interface Bucket { tokens: number; last: number }
const buckets = new Map<string, Bucket>();

export function take(key: string, rule: Rule, now = Date.now()) {
  let b = buckets.get(key);
  if (!b) b = { tokens: rule.capacity, last: now };
  b.tokens = Math.min(rule.capacity, b.tokens + ((now - b.last) / 1000) * rule.refillPerSec);
  b.last = now;
  const allowed = b.tokens >= 1;
  if (allowed) b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.last > 600_000) buckets.delete(k);
  return { allowed, limit: rule.capacity, remaining: Math.floor(b.tokens), retryAfter: allowed ? 0 : Math.ceil((1 - b.tokens) / rule.refillPerSec) };
}

// --- Bloqueo REAL tras fallos o reincidencia: mientras dura, NO se consumen ni se rellenan tokens; la clave queda bloqueada ---
// Cada reincidencia duplica el tiempo (×1, ×2, ×4; tope ×4) y se recuerda durante 1 hora tras terminar el bloqueo.
interface Fallos { n: number; first: number; lockedUntil: number; locks: number }
const fails = new Map<string, Fallos>();
export function lockedFor(key: string, now = Date.now()) {
  const f = fails.get(key);
  return f && f.lockedUntil > now ? Math.ceil((f.lockedUntil - now) / 1000) : 0;
}
/** Registra un fallo; devuelve true si con este fallo la clave queda bloqueada. */
export function recordFailure(key: string, cfg: { max: number; windowMs: number; lockMs: number }, now = Date.now()) {
  let f = fails.get(key);
  if (!f || now - f.first > cfg.windowMs) f = { n: 0, first: now, lockedUntil: 0, locks: f && now - f.lockedUntil < 3_600_000 ? f.locks : 0 };
  f.n++;
  if (f.n >= cfg.max) { f.locks++; f.lockedUntil = now + cfg.lockMs * Math.min(4, 2 ** (f.locks - 1)); f.n = 0; f.first = now; }
  fails.set(key, f);
  if (fails.size > 5000) for (const [k, v] of fails) if (v.lockedUntil < now && now - v.first > cfg.windowMs) fails.delete(k);
  return f.lockedUntil > now;
}
export const clearFailures = (key: string) => fails.delete(key);
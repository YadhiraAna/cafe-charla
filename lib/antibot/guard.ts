/**
 * Control de tráfico y de origen para TODAS las rutas de la API:
 *  1) CSRF: toda petición que cambia datos debe traer la cabecera x-csrf-token, firmada, ligada a la sesión y verificada aquí
 *     (además de comprobar el Origin). 2) Rate limiting por IP Y por sesión (cubeta de tokens; 429 + Retry-After).
 *  3) Bloqueo REAL por reincidencia: tras agotar la cubeta varias veces, la IP/sesión queda bloqueada varios minutos.
 *  Sesión anti-bot: cookie firmada `ab_sid`. Extractor autorizado: cookie firmada y con caducidad `ab_scraper`.
 */
import "server-only";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { HttpError } from "@/lib/http-error";
import { POLICIES, PENALIZACION, IP_MULTIPLIER, STAFF_MULTIPLIER, SCRAPER_COOKIE_TTL_S, Policy, scale } from "@/lib/antibot/config";
import { take, lockedFor, recordFailure } from "@/lib/antibot/ratelimit";
import { recordEvent } from "@/lib/antibot/events";

const secret = () => { const s = process.env.CAPTCHA_SECRET; if (!s) throw new Error("Falta CAPTCHA_SECRET"); return s; };
const hmac = (s: string) => crypto.createHmac("sha256", secret()).update(s).digest("hex");

export interface Ctx { ip: string; sid: string; ua: string; scraper: boolean }
export const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";

/** Cookie `ab_scraper` = "<timestamp>.<HMAC(SCRAPER_API_KEY)>", válida 2 horas. Solo la puede generar quien tenga la clave. */
export function isAuthorizedScraper(value?: string) {
  const key = process.env.SCRAPER_API_KEY;
  if (!key || key.length < 16 || !value) return false;
  const [ts, sig] = value.split("."), t = Number(ts), nowS = Date.now() / 1000;
  if (!t || nowS - t > SCRAPER_COOKIE_TTL_S || t > nowS + 60 || !sig) return false;
  const exp = crypto.createHmac("sha256", key).update(`scraper:${ts}`).digest("hex");
  return sig.length === exp.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp));
}

const cache = new WeakMap<NextRequest, Ctx>();
export function getCtx(req: NextRequest): Ctx {
  const hit = cache.get(req); if (hit) return hit;
  let sid = "";
  const raw = req.cookies.get("ab_sid")?.value;
  if (raw) { const [r, sig] = raw.split("."); if (r && sig && sig === hmac(r).slice(0, 16)) sid = raw; }
  if (!sid) {
    const r = crypto.randomBytes(12).toString("hex");
    sid = `${r}.${hmac(r).slice(0, 16)}`;
    try { cookies().set("ab_sid", sid, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 }); } catch {}
  }
  const ctx = { ip: clientIp(req), sid, ua: req.headers.get("user-agent") ?? "", scraper: isAuthorizedScraper(req.cookies.get("ab_scraper")?.value) };
  cache.set(req, ctx);
  return ctx;
}

// ── CSRF: token firmado y ligado a la sesión (cookie ab_sid). El navegador lo pide a /api/csrf y lo envía en x-csrf-token. ──
const CSRF_TTL_MS = 12 * 3600_000;
const etiqueta = (sid: string) => crypto.createHash("sha256").update(sid).digest("hex").slice(0, 8);
export function emitirCsrf(sid: string, ahora = Date.now()) { const c = `${ahora}.${etiqueta(sid)}`; return `${c}.${hmac(`csrf:${c}`).slice(0, 32)}`; }
export function verificarCsrf(token: string | null, sid: string, ahora = Date.now()): boolean {
  const [ts, tag, sig] = (token ?? "").split(".");
  if (!ts || !tag || !sig || sig !== hmac(`csrf:${ts}.${tag}`).slice(0, 32) || tag !== etiqueta(sid)) return false;
  const edad = ahora - Number(ts);
  return edad >= 0 && edad <= CSRF_TTL_MS;
}
/** Defensa de origen: una petición que cambia datos y trae cabecera Origin debe venir del mismo sitio (sin Origin = no es un navegador). */
export function origenValido(origin: string | null, host: string | null) {
  if (!origin) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}

const fmt = (s: number) => (s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`);
const tooMany = (retry: number, limit: number, mensaje = "Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.") =>
  new HttpError(429, mensaje, { "Retry-After": String(Math.max(1, retry)), "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": "0" });

/**
 * Orden de las defensas: origen → token CSRF → bloqueo vigente → cubetas por IP y sesión → bloqueo por reincidencia.
 * `csrf: false` solo para rutas que se autentican de otra forma (p. ej. el extractor autorizado con su clave).
 */
export async function guard(req: NextRequest, policy: Policy, opts: { csrf?: boolean } = {}): Promise<Ctx> {
  const ctx = getCtx(req), ruta = req.nextUrl.pathname;
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    if (!origenValido(req.headers.get("origin"), req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) {
      await recordEvent({ kind: "csrf", verdict: "csrf_rejected", score: 100, signals: ["origin_distinto_del_sitio"], route: ruta, ctx });
      throw new HttpError(403, "Origen de la petición no permitido.");
    }
    if (opts.csrf !== false && !verificarCsrf(req.headers.get("x-csrf-token"), ctx.sid)) {
      await recordEvent({ kind: "csrf", verdict: "csrf_rejected", score: 100, signals: ["token_csrf_invalido"], route: ruta, ctx });
      throw new HttpError(403, "Token CSRF ausente o inválido. Recarga la página e inténtalo de nuevo.");
    }
  }
  const pen = PENALIZACION[policy] ?? PENALIZACION.default;
  const claves = ctx.scraper
    ? [{ k: `scraper:${ctx.ip}`, rule: POLICIES.scraper, ban: `ban:scraper:${ctx.ip}` }]
    : [{ k: `${policy}:ip:${ctx.ip}`, rule: scale(POLICIES[policy], IP_MULTIPLIER), ban: `ban:${policy}:ip:${ctx.ip}` },
       { k: `${policy}:sid:${ctx.sid}`, rule: POLICIES[policy], ban: `ban:${policy}:sid:${ctx.sid}` }];

  const bloqueo = Math.max(...claves.map(c => lockedFor(c.ban)));
  if (bloqueo > 0) { // bloqueo vigente: no se consumen tokens ni se rellenan; hay que esperar de verdad
    await recordEvent({ kind: "rate_limit", verdict: "locked", score: 0, signals: [`politica:${policy}`, "bloqueo_temporal_por_reincidencia"], route: ruta, ctx });
    throw tooMany(bloqueo, POLICIES[policy].capacity, `Bloqueado temporalmente por exceso de solicitudes. Inténtalo de nuevo en ${fmt(bloqueo)}.`);
  }
  const negadas = claves.map(c => ({ c, r: take(c.k, c.rule) })).filter(x => !x.r.allowed);
  if (negadas.length) {
    let bloqueada = false;
    for (const x of negadas) if (recordFailure(x.c.ban, pen)) bloqueada = true; // cada vez que se agota la cubeta cuenta como reincidencia
    await recordEvent({ kind: "rate_limit", verdict: bloqueada ? "locked" : "rate_limited", score: 0, signals: [`politica:${policy}`, ...(bloqueada ? ["bloqueo_temporal_por_reincidencia"] : [])], route: ruta, ctx });
    if (bloqueada) { const s = Math.max(...claves.map(c => lockedFor(c.ban))); throw tooMany(s, negadas[0].r.limit, `Demasiados intentos. Tu acceso a esta acción quedó bloqueado: inténtalo de nuevo en ${fmt(s)}.`); }
    throw tooMany(Math.max(...negadas.map(x => x.r.retryAfter)), negadas[0].r.limit);
  }
  return ctx;
}

/** Límite adicional por usuario autenticado (independiente de IP y sesión). */
export function limitUser(uid: string, role: string) {
  const rule = role === "user" ? POLICIES.user : scale(POLICIES.user, STAFF_MULTIPLIER);
  const r = take(`user:${uid}`, rule);
  if (!r.allowed) {
    void recordEvent({ kind: "rate_limit", verdict: "rate_limited", score: 0, signals: ["politica:user"], route: "(autenticado)", userId: uid, ctx: { ip: "usuario", sid: uid, ua: "", scraper: false } });
    throw tooMany(r.retryAfter, r.limit);
  }
}
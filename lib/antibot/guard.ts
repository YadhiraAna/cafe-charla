/**
 * Control de tráfico (rate limiting) por IP Y por sesión. Responde 429 con Retry-After.
 *  - Sesión: cookie firmada `ab_sid` (HttpOnly). Varias pestañas comparten sesión → comparten cubeta.
 *  - IP: cubeta 3× mayor (IP_MULTIPLIER). Un bot que borra cookies en cada petición sigue limitado por IP.
 *  - Extractor autorizado: cookie firmada y con caducidad `ab_scraper`; usa su propia política y queda auditado.
 */
import "server-only";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { HttpError } from "@/lib/http-error";
import { POLICIES, IP_MULTIPLIER, STAFF_MULTIPLIER, SCRAPER_COOKIE_TTL_S, Policy, scale } from "@/lib/antibot/config";
import { take } from "@/lib/antibot/ratelimit";
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
    try { cookies().set("ab_sid", sid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 }); } catch {}
  }
  const ctx = { ip: clientIp(req), sid, ua: req.headers.get("user-agent") ?? "", scraper: isAuthorizedScraper(req.cookies.get("ab_scraper")?.value) };
  cache.set(req, ctx);
  return ctx;
}

const tooMany = (retry: number, limit: number) => new HttpError(429, "Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.",
  { "Retry-After": String(Math.max(1, retry)), "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": "0" });
/** Defensa CSRF: una petición que cambia datos y trae cabecera Origin debe venir del mismo sitio (sin Origin = no es un navegador). */
export function origenValido(origin: string | null, host: string | null) {
  if (!origin) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}
/** Aplica la política a la IP y a la sesión. Lanza HttpError 429 si cualquiera de las dos cubetas está agotada. */
export async function guard(req: NextRequest, policy: Policy): Promise<Ctx> {
  const ctx = getCtx(req);
    if (req.method !== "GET" && req.method !== "HEAD" && !origenValido(req.headers.get("origin"), req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) {
    await recordEvent({ kind: "csrf", verdict: "csrf_rejected", score: 100, signals: ["origin_distinto_del_sitio"], route: req.nextUrl.pathname, ctx });
    throw new HttpError(403, "Origen de la petición no permitido.");
  }
  const results = ctx.scraper
    ? [take(`scraper:${ctx.ip}`, POLICIES.scraper)]
    : [take(`${policy}:ip:${ctx.ip}`, scale(POLICIES[policy], IP_MULTIPLIER)), take(`${policy}:sid:${ctx.sid}`, POLICIES[policy])];
  if (results.some(r => !r.allowed)) {
    await recordEvent({ kind: "rate_limit", verdict: "rate_limited", score: 0, signals: [`politica:${policy}`], route: req.nextUrl.pathname, ctx });
    throw tooMany(Math.max(...results.map(r => r.retryAfter)), results[0].limit);
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

/**
 * Verificación "¿es una persona?" en el SERVIDOR antes de procesar formularios sensibles:
 *  1) cabeceras + parámetros + comportamiento + entropía + visibilidad + entorno (globals, timing, huella) → puntaje;
 *  2) honeypot; 3) token de formulario firmado, de un solo uso y ATADO A LA SESIÓN (anti-CSRF); 4) CAPTCHA.
 * Cada resultado (superado, fallido, bloqueado) queda registrado con su técnica ("tipo").
 */
import "server-only";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { HttpError } from "@/lib/http-error";
import { verifyCaptcha, CaptchaKind } from "@/lib/captcha/server";
import { getCtx } from "@/lib/antibot/guard";
import { recordEvent, Actor } from "@/lib/antibot/events";
import { scoreBehavior, scoreEntorno, scoreFingerprint, scoreHeaders, total, levelOf, Signal } from "@/lib/antibot/score";
import { FORM_TOKEN_TTL_MS, MIN_FORM_MS, TECNICAS_EVALUADAS } from "@/lib/antibot/config";
import type { AntibotPayload } from "@/lib/antibot/types";

const sign = (body: string) => crypto.createHmac("sha256", process.env.CAPTCHA_SECRET ?? "").update(`form:${body}`).digest("hex").slice(0, 24);
const tag = (sid: string) => crypto.createHash("sha256").update(sid).digest("hex").slice(0, 8);
const usedNonces = new Set<string>();
const flagged = new Set<string>();   // sesiones que el fingerprint ya marcó como sospechosas
export const flagSession = (sid: string) => { flagged.add(sid); if (flagged.size > 5000) flagged.clear(); };

/** Token invisible emitido al mostrar el formulario: hora firmada + etiqueta de la sesión que lo pidió. */
export function issueFormToken(sid: string) {
  const body = `${Date.now()}.${crypto.randomBytes(8).toString("hex")}.${tag(sid)}`;
  return `${body}.${sign(body)}`;
}
export type TokenEstado = { estado: "ok"; age: number } | { estado: "invalido" } | { estado: "otra_sesion" };
/** ok = válido y de esta sesión (se consume); invalido = alterado, caducado o reutilizado; otra_sesion = emitido a OTRA sesión (CSRF). */
export function verifyFormToken(token: string, sid: string): TokenEstado {
  const [ts, nonce, t, sig] = (token ?? "").split(".");
  if (!ts || !nonce || !t || !sig || sig !== sign(`${ts}.${nonce}.${t}`)) return { estado: "invalido" };
  const age = Date.now() - Number(ts);
  if (!(age >= 0) || age > FORM_TOKEN_TTL_MS || usedNonces.has(nonce)) return { estado: "invalido" };
  if (t !== tag(sid)) return { estado: "otra_sesion" };
  usedNonces.add(nonce);
  if (usedNonces.size > 5000) usedNonces.clear();
  return { estado: "ok", age };
}

/** Huella reutilizada: la MISMA huella de navegador en 8 o más sesiones distintas en 10 min (granja de bots con un mismo perfil). */
const huellas = new Map<string, { sids: Set<string>; t: number }>();
export function huellaEnMuchasSesiones(hash: string, sid: string, ahora = Date.now()): boolean {
  if (!hash) return false;
  let h = huellas.get(hash);
  if (!h || ahora - h.t > 600_000) h = { sids: new Set(), t: ahora };
  h.sids.add(sid); huellas.set(hash, h);
  if (huellas.size > 3000) huellas.clear();
  return h.sids.size >= 8;
}

export interface Info { accion: string; datos?: string; actor?: Actor }

export async function requireHuman(req: NextRequest, kind: CaptchaKind, b: { captchaToken: string; captchaAnswer: string; antibot?: AntibotPayload }, info: Info) {
  const ctx = getCtx(req), a = b.antibot;
  const base = { ctx, route: req.nextUrl.pathname, actor: info.actor, accion: info.accion, captcha: kind, datos: info.datos,
    evaluadas: a ? TECNICAS_EVALUADAS : ["cabeceras"], huella: a?.entorno?.huella.hash.slice(0, 14) };
  const signals: Signal[] = scoreHeaders({ ua: ctx.ua, acceptLanguage: req.headers.get("accept-language") ?? "" });
  if (flagged.has(ctx.sid)) signals.push({ name: "sesion_marcada_por_fingerprint", weight: 30 });
  if (!a) signals.push({ name: "sin_telemetria", weight: 60 });
  else {
    if (a.website) signals.push({ name: "honeypot_rellenado", weight: 100 });
    const t = verifyFormToken(a.formToken, ctx.sid);
    if (t.estado === "otra_sesion") {
      await recordEvent({ ...base, kind: "csrf", verdict: "csrf_rejected", score: 100, signals: ["token_de_formulario_de_otra_sesion"] });
      throw new HttpError(403, "El formulario no pertenece a tu sesión (posible CSRF). Recarga la página e inténtalo de nuevo.");
    }
    if (t.estado === "invalido") signals.push({ name: "token_de_formulario_invalido", weight: 50 });
    else {
      if (t.age < MIN_FORM_MS) signals.push({ name: "formulario_enviado_demasiado_rapido", weight: 100 });
      // Contraste de relojes: el navegador no puede decir que el formulario lleva menos tiempo abierto que el que midió el servidor
      if (a.behavior?.ageMs !== undefined && a.behavior.ageMs + 3000 < t.age) signals.push({ name: "telemetria_incoherente_con_servidor", weight: 40 });
    }
    signals.push(...scoreBehavior(a.behavior), ...scoreFingerprint(a.fp, ctx.ua), ...scoreEntorno(a.entorno, a.fp?.touch ?? false, ctx.ua));
    if (a.entorno && huellaEnMuchasSesiones(a.entorno.huella.hash, ctx.sid)) signals.push({ name: "huella_en_muchas_sesiones", weight: 15 });
  }
  const score = total(signals), level = levelOf(score), nombres = signals.map(s => s.name);
  if (level !== "human") await recordEvent({ ...base, kind: "behavior", verdict: level, score, signals: nombres });
  if (level === "blocked") throw new HttpError(403, "No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.");

  const v = verifyCaptcha(b.captchaToken, kind, b.captchaAnswer);
  if (!v.ok) {
    await recordEvent({ ...base, kind: "captcha", verdict: "captcha_failed", score, signals: [v.reason ?? "respuesta_incorrecta"] });
    throw new HttpError(400, v.reason ?? "CAPTCHA incorrecto.");
  }
  await recordEvent({ ...base, kind: "captcha", verdict: "passed", score, signals: level === "suspicious" ? nombres : [] });
}
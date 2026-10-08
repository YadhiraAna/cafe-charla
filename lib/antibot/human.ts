/**
 * Verificación "¿es una persona?" en el SERVIDOR, antes de procesar formularios sensibles:
 *  1) cabeceras + fingerprint + biometría → puntaje; 2) honeypot; 3) token de formulario firmado (tiempo medido por el servidor);
 *  4) CAPTCHA. Nada de esto se decide en el navegador: el cliente solo aporta datos que el servidor evalúa.
 */
import "server-only";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { HttpError } from "@/lib/http-error";
import { verifyCaptcha, CaptchaKind } from "@/lib/captcha/server";
import { getCtx } from "@/lib/antibot/guard";
import { recordEvent } from "@/lib/antibot/events";
import { scoreBehavior, scoreFingerprint, scoreHeaders, total, levelOf, Signal } from "@/lib/antibot/score";
import { FORM_TOKEN_TTL_MS, MIN_FORM_MS } from "@/lib/antibot/config";
import type { AntibotPayload } from "@/lib/antibot/types";

const sign = (body: string) => crypto.createHmac("sha256", process.env.CAPTCHA_SECRET ?? "").update(`form:${body}`).digest("hex").slice(0, 24);
const usedNonces = new Set<string>();
const flagged = new Set<string>();   // sesiones que el fingerprint ya marcó como sospechosas
export const flagSession = (sid: string) => { flagged.add(sid); if (flagged.size > 5000) flagged.clear(); };

/** Token invisible emitido al mostrar el formulario: lleva la hora de emisión firmada. */
export function issueFormToken() {
  const body = `${Date.now()}.${crypto.randomBytes(8).toString("hex")}`;
  return `${body}.${sign(body)}`;
}
/** Devuelve cuántos ms pasaron desde la emisión, o null si es inválido, caducado o reutilizado (un solo uso). */
export function formTokenAge(token: string): number | null {
  const [ts, nonce, sig] = (token ?? "").split(".");
  if (!ts || !nonce || !sig || sig !== sign(`${ts}.${nonce}`)) return null;
  const age = Date.now() - Number(ts);
  if (!(age >= 0) || age > FORM_TOKEN_TTL_MS || usedNonces.has(nonce)) return null;
  usedNonces.add(nonce);
  if (usedNonces.size > 5000) usedNonces.clear();
  return age;
}

export async function requireHuman(req: NextRequest, kind: CaptchaKind, b: { captchaToken: string; captchaAnswer: string; antibot?: AntibotPayload }, userId?: string) {
  const ctx = getCtx(req), a = b.antibot;
  const signals: Signal[] = scoreHeaders({ ua: ctx.ua, acceptLanguage: req.headers.get("accept-language") ?? "" });
  if (flagged.has(ctx.sid)) signals.push({ name: "sesion_marcada_por_fingerprint", weight: 30 });
  if (!a) signals.push({ name: "sin_telemetria", weight: 60 });
  else {
    if (a.website) signals.push({ name: "honeypot_rellenado", weight: 100 });
    const age = formTokenAge(a.formToken);
    if (age === null) signals.push({ name: "token_de_formulario_invalido", weight: 50 });
    else if (age < MIN_FORM_MS) signals.push({ name: "formulario_enviado_demasiado_rapido", weight: 100 });
    signals.push(...scoreBehavior(a.behavior), ...scoreFingerprint(a.fp, ctx.ua));
  }
  const score = total(signals), level = levelOf(score);
  if (level !== "human") await recordEvent({ kind: "behavior", verdict: level, score, signals: signals.map(s => s.name), route: req.nextUrl.pathname, ctx, userId });
  if (level === "blocked") throw new HttpError(403, "No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.");
  const v = verifyCaptcha(b.captchaToken, kind, b.captchaAnswer);
  if (!v.ok) throw new HttpError(400, v.reason ?? "CAPTCHA incorrecto.");
}

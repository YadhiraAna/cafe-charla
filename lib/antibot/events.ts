/**
 * Auditoría y actividad de seguridad: colección `security_events` (solo lectura para admin) + entrada en `logs`.
 * Cada evento indica QUÉ MECANISMO se ejercita (CAPTCHA, interacción humana, rate limiting, sesión/CSRF), QUIÉN lo hizo,
 * QUÉ intentaba, con qué CAPTCHA y un resumen NO sensible de lo enviado (longitudes; nunca contraseñas ni contenido).
 * - Se imprime SIEMPRE en la consola del servidor.
 * - Alertas repetidas (misma clase, origen y ruta en 60 s) incrementan `attempts` en vez de crear documentos.
 * - La actividad normal (CAPTCHA superado o fallido) se guarda siempre.
 */
import "server-only";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { writeLog } from "@/lib/logs/logger";
import { EVENT_DEDUPE_MS, MAX_EVENTS_PER_HOUR, MECANISMOS, Mecanismo } from "@/lib/antibot/config";
import type { Ctx } from "@/lib/antibot/guard";

export type Verdict = "blocked" | "suspicious" | "rate_limited" | "authorized_scraper" | "locked" | "passed" | "captcha_failed" | "csrf_rejected";
export interface Actor { uid?: string; name: string; role: string }
export interface EventInput {
  kind: "rate_limit" | "behavior" | "fingerprint" | "bruteforce" | "captcha" | "csrf";
  verdict: Verdict; score: number; signals: string[]; route: string; ctx: Ctx;
  mechanism?: Mecanismo;   // si no se indica, se deduce de `kind`
  actor?: Actor;           // quién lo hizo
  userId?: string;         // compatibilidad con llamadas anteriores
  accion?: string;         // qué intentaba: login, registro, crear_publicacion…
  captcha?: string;        // tipo de CAPTCHA: text, math, images, question, select
  datos?: string;          // resumen no sensible de lo enviado
}

const POR_TIPO: Record<EventInput["kind"], Mecanismo> = { rate_limit: "rate_limit", bruteforce: "rate_limit", behavior: "interaccion", fingerprint: "interaccion", captcha: "captcha", csrf: "sesion" };
const ACTIVIDAD: Verdict[] = ["passed", "captcha_failed"];
const ETIQUETA: Record<Verdict, string> = { passed: "verificación superada", captcha_failed: "CAPTCHA incorrecto", blocked: "bloqueado", suspicious: "sospechoso",
  rate_limited: "límite excedido (429)", locked: "bloqueo temporal", csrf_rejected: "rechazado por CSRF", authorized_scraper: "extractor autorizado" };

const seen = new Map<string, { t: number; id: string; n: number }>();
let hour = { start: Date.now(), count: 0 };
const h8 = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
export const maskIp = (ip: string) => ip.includes(":") ? ip.split(":").slice(0, 3).join(":") + "::" : ip.split(".").length === 4 ? ip.split(".").slice(0, 3).join(".") + ".0" : ip;
export const enmascararCorreo = (c: string) => { const [u, d] = c.split("@"); return d ? `${u.slice(0, 1)}***@${d}` : "***"; };

export async function recordEvent(e: EventInput) {
  const mecanismo = e.mechanism ?? POR_TIPO[e.kind];
  const nombre = e.actor?.name ?? "Visitante", rol = e.actor?.role ?? "visitante", uid = e.actor?.uid ?? e.userId ?? "";
  console.warn(`[antibot] ${new Date().toISOString()} ${e.verdict.toUpperCase()} mecanismo=${mecanismo} usuario=${nombre} accion=${e.accion ?? "-"} captcha=${e.captcha ?? "-"} score=${e.score} ruta=${e.route} ip=${maskIp(e.ctx.ip)} señales=${e.signals.join(",") || "-"}`);
  try {
    const now = Date.now();
    if (now - hour.start > 3_600_000) hour = { start: now, count: 0 };
    if (hour.count >= MAX_EVENTS_PER_HOUR) return;
    const actividad = ACTIVIDAD.includes(e.verdict);
    const key = `${e.kind}:${e.verdict}:${h8(e.ctx.ip)}:${e.route}`;
    if (!actividad) {
      const prev = seen.get(key);
      if (prev && now - prev.t < EVENT_DEDUPE_MS) {
        prev.n++; hour.count++;
        await adminDb.doc(`security_events/${prev.id}`).update({ attempts: prev.n, lastTs: FieldValue.serverTimestamp() });
        return;
      }
    }
    hour.count++;
    const ref = await adminDb.collection("security_events").add({
      ts: FieldValue.serverTimestamp(), kind: e.kind, mechanism: mecanismo, verdict: e.verdict, score: e.score, signals: e.signals.slice(0, 12), route: e.route.slice(0, 120),
      accion: e.accion ?? "", captcha: e.captcha ?? "", datos: (e.datos ?? "").slice(0, 200), userName: nombre, userRole: rol, userId: uid,
      ip: maskIp(e.ctx.ip), ipHash: h8(e.ctx.ip), ua: e.ctx.ua.slice(0, 160), sid: h8(e.ctx.sid), review: null, attempts: 1,
    });
    if (!actividad) {
      seen.set(key, { t: now, id: ref.id, n: 1 });
      if (seen.size > 2000) for (const [k, v] of seen) if (now - v.t > EVENT_DEDUPE_MS) seen.delete(k);
    }
    await writeLog({
      userName: nombre, userId: uid || "anonymous", userRole: rol, action: "SECURITY", module: "security",
      targetType: `mecanismo:${mecanismo}`, targetId: e.accion ?? h8(e.ctx.ip),
      status: e.verdict === "passed" || e.verdict === "authorized_scraper" ? "success" : e.verdict === "suspicious" || e.verdict === "captcha_failed" ? "error" : "denied",
      description: `[${MECANISMOS[mecanismo]}] ${e.accion ?? e.route}: ${ETIQUETA[e.verdict]}${e.captcha ? ` · CAPTCHA ${e.captcha}` : ""} · puntaje ${e.score}${e.datos ? ` · ${e.datos}` : ""}${e.signals.length ? ` · ${e.signals.slice(0, 4).join(", ")}` : ""}`,
    });
  } catch (err) { console.error("[antibot] evento no registrado", err); }
}
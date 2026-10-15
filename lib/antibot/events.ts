/**
 * Auditoría de tráfico sospechoso: colección `security_events` (solo lectura para admin) + entrada en `logs`.
 * - Cada evento se imprime SIEMPRE en la consola del servidor (para mostrar la razón del bloqueo en vivo).
 * - Los eventos repetidos (mismo tipo, origen y ruta en 60 s) no crean documentos nuevos: incrementan `attempts`.
 * - IP enmascarada por privacidad; tope por hora para proteger la cuota de escrituras de Firestore.
 */
import "server-only";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { writeLog } from "@/lib/logs/logger";
import { EVENT_DEDUPE_MS, MAX_EVENTS_PER_HOUR } from "@/lib/antibot/config";
import type { Ctx } from "@/lib/antibot/guard";

export type Verdict = "blocked" | "suspicious" | "rate_limited" | "authorized_scraper" | "locked";
export interface EventInput { kind: "rate_limit" | "behavior" | "fingerprint" | "bruteforce"; verdict: Verdict; score: number; signals: string[]; route: string; ctx: Ctx; userId?: string }

const seen = new Map<string, { t: number; id: string; n: number }>();
let hour = { start: Date.now(), count: 0 };
const h8 = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
export const maskIp = (ip: string) => ip.includes(":") ? ip.split(":").slice(0, 3).join(":") + "::" : ip.split(".").length === 4 ? ip.split(".").slice(0, 3).join(".") + ".0" : ip;

export async function recordEvent(e: EventInput) {
  // 1) Consola del servidor: siempre, aunque Firestore no registre el evento.
  console.warn(`[antibot] ${new Date().toISOString()} ${e.verdict.toUpperCase()} (${e.kind}) score=${e.score} ruta=${e.route} ip=${maskIp(e.ctx.ip)} sesion=${h8(e.ctx.sid)} señales=${e.signals.join(",") || "-"}`);
  try {
    const now = Date.now();
    if (now - hour.start > 3_600_000) hour = { start: now, count: 0 };
    if (hour.count >= MAX_EVENTS_PER_HOUR) return;
    const key = `${e.kind}:${e.verdict}:${h8(e.ctx.ip)}:${e.route}`;

    // 2) Repetido dentro de la ventana: solo se cuenta el intento.
    const prev = seen.get(key);
    if (prev && now - prev.t < EVENT_DEDUPE_MS) {
      prev.n++; hour.count++;
      await adminDb.doc(`security_events/${prev.id}`).update({ attempts: prev.n, lastTs: FieldValue.serverTimestamp() });
      return;
    }

    // 3) Evento nuevo.
    hour.count++;
    const ref = await adminDb.collection("security_events").add({
      ts: FieldValue.serverTimestamp(), kind: e.kind, verdict: e.verdict, score: e.score, signals: e.signals.slice(0, 12), route: e.route.slice(0, 120),
      ip: maskIp(e.ctx.ip), ipHash: h8(e.ctx.ip), ua: e.ctx.ua.slice(0, 160), sid: h8(e.ctx.sid), userId: e.userId ?? "", review: null, attempts: 1,
    });
    seen.set(key, { t: now, id: ref.id, n: 1 });
    if (seen.size > 2000) for (const [k, v] of seen) if (now - v.t > EVENT_DEDUPE_MS) seen.delete(k);
    await writeLog({ userName: "Seguridad", userId: "system:antibot", userRole: "system", action: "SECURITY", module: "security", targetType: e.kind, targetId: h8(e.ctx.ip),
      status: e.verdict === "authorized_scraper" ? "success" : e.verdict === "suspicious" ? "error" : "denied",
      description: `${e.verdict} (${e.kind}) score=${e.score} en ${e.route}: ${e.signals.slice(0, 4).join(", ")}` });
  } catch (err) { console.error("[antibot] evento no registrado", err); }
}
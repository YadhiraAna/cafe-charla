/**
 * Auditoría de tráfico sospechoso: colección `security_events` (solo lectura para admin) + entrada en `logs`.
 * Se guarda la IP enmascarada (privacidad) y un hash corto para correlacionar. Deduplicado y con tope por hora
 * para que un ataque no agote la cuota de escrituras de Firestore.
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

const seen = new Map<string, number>();
let hour = { start: Date.now(), count: 0 };
const h8 = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
export const maskIp = (ip: string) => ip.includes(":") ? ip.split(":").slice(0, 3).join(":") + "::" : ip.split(".").length === 4 ? ip.split(".").slice(0, 3).join(".") + ".0" : ip;

export async function recordEvent(e: EventInput) {
  try {
    const now = Date.now();
    if (now - hour.start > 3_600_000) hour = { start: now, count: 0 };
    if (hour.count >= MAX_EVENTS_PER_HOUR) return;
    const key = `${e.kind}:${e.verdict}:${h8(e.ctx.ip)}:${e.route}`;
    const last = seen.get(key);
    if (last && now - last < EVENT_DEDUPE_MS) return;
    seen.set(key, now);
    if (seen.size > 2000) for (const [k, t] of seen) if (now - t > EVENT_DEDUPE_MS) seen.delete(k);
    hour.count++;
    await adminDb.collection("security_events").add({
      ts: FieldValue.serverTimestamp(), kind: e.kind, verdict: e.verdict, score: e.score, signals: e.signals.slice(0, 12), route: e.route.slice(0, 120),
      ip: maskIp(e.ctx.ip), ipHash: h8(e.ctx.ip), ua: e.ctx.ua.slice(0, 160), sid: h8(e.ctx.sid), userId: e.userId ?? "", review: null,
    });
    await writeLog({ userName: "Seguridad", userId: "system:antibot", userRole: "system", action: "SECURITY", module: "security", targetType: e.kind, targetId: h8(e.ctx.ip),
      status: e.verdict === "authorized_scraper" ? "success" : e.verdict === "suspicious" ? "error" : "denied",
      description: `${e.verdict} (${e.kind}) score=${e.score} en ${e.route}: ${e.signals.slice(0, 4).join(", ")}` });
  } catch (err) { console.error("[antibot] evento no registrado", err); }
}

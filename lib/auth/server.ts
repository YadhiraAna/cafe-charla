/**
 * Autorización server-side. El rol se lee SIEMPRE de Firestore (users/{uid}), nunca del cuerpo de la petición.
 * Sesión: ID token (Bearer) o cookie httpOnly "sesion". Inactividad: cookie firmada "actividad" con renovación deslizante.
 */
import "server-only";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { HttpError } from "@/lib/http-error";
import { guard, getCtx, limitUser } from "@/lib/antibot/guard";
import { recordEvent } from "@/lib/antibot/events";
import { INACTIVIDAD_SERVIDOR_MIN } from "@/lib/antibot/config";

export type Role = "user" | "moderator" | "admin" | "waiter";
export interface Session { uid: string; name: string; role: Role; email?: string }
export { HttpError };

const firma = (uid: string, ts: number) => crypto.createHmac("sha256", process.env.CAPTCHA_SECRET ?? "").update(`act:${uid}:${ts}`).digest("hex").slice(0, 24);

/** La cookie `actividad` vale "uid.marca.firma". Devuelve la marca de tiempo solo si la firma es válida y es de ESTE usuario. */
export function leerActividad(valor: string | undefined, uid: string): number | null {
  const [u, ts, sig] = (valor ?? "").split(".");
  if (!u || !ts || !sig || u !== uid || sig !== firma(uid, Number(ts))) return null;
  return Number(ts);
}
export function renovarActividad(uid: string) {
  const ts = Date.now();
  cookies().set("actividad", `${uid}.${ts}.${firma(uid, ts)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 24 * 3600 });
}
/** Vencida si pasó más de `limiteMin` desde lo MÁS RECIENTE entre la última actividad y el último inicio de sesión (auth_time). Sin cookie no se aplica. */
export function actividadVencida(ultimaMs: number | null, authMs: number, ahoraMs: number, limiteMin = INACTIVIDAD_SERVIDOR_MIN) {
  return ultimaMs !== null && ahoraMs - Math.max(ultimaMs, authMs) > limiteMin * 60_000;
}

/** Verifica CSRF, límites de peticiones, sesión, inactividad, estado de la cuenta y rol. */
export async function requireRole(req: NextRequest, roles: Role[]): Promise<Session> {
  await guard(req, "write"); // CSRF + rate limit por IP y sesión antes de tocar nada
  const header = req.headers.get("authorization") ?? "", cookie = req.cookies.get("sesion")?.value;
  if (!header.startsWith("Bearer ") && !cookie) throw new HttpError(401, "Debes iniciar sesión.");
  let uid: string, authMs: number;
  try {
    const d = header.startsWith("Bearer ") ? await adminAuth.verifyIdToken(header.slice(7), true) : await adminAuth.verifySessionCookie(cookie!, true);
    uid = d.uid; authMs = (d.auth_time ?? 0) * 1000;
  } catch { throw new HttpError(401, "Sesión inválida o expirada."); }
  if (actividadVencida(leerActividad(req.cookies.get("actividad")?.value, uid), authMs, Date.now())) {
    await recordEvent({ kind: "session", verdict: "session_expired", score: 0, signals: ["inactividad_servidor"], route: req.nextUrl.pathname, ctx: getCtx(req), userId: uid, accion: "sesion_vencida" });
    throw new HttpError(401, "Tu sesión expiró por inactividad. Inicia sesión de nuevo.");
  }
  const user = (await adminDb.doc(`users/${uid}`).get()).data();
  if (!user || user.status !== "active") throw new HttpError(403, "Cuenta inactiva o inexistente.");
  limitUser(uid, user.role); // rate limit por usuario
  if (!roles.includes(user.role)) throw new HttpError(403, "No tienes permiso para esta acción.");
  renovarActividad(uid);
  return { uid, name: String(user.name ?? ""), role: user.role, email: user.email ? String(user.email) : undefined };
}

/** Convierte cualquier error en respuesta JSON sin filtrar detalles internos. */
export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status, headers: e.headers });
  console.error(e);
  return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
}
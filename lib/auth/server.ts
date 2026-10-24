/**
 * Autorización server-side. El rol se lee SIEMPRE de Firestore (users/{uid}),
 * nunca del cuerpo de la petición ni de datos manipulables por el cliente.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { HttpError } from "@/lib/http-error";
import { guard, limitUser } from "@/lib/antibot/guard";

export type Role = "user" | "moderator" | "admin" | "waiter";
export interface Session { uid: string; name: string; role: Role }

export { HttpError };

/** Verifica el ID token (Bearer) o la cookie de sesión y que el rol del usuario esté permitido. */
export async function requireRole(req: NextRequest, roles: Role[]): Promise<Session> {
  await guard(req, "write"); // rate limit por IP y sesión antes de tocar nada
  const header = req.headers.get("authorization") ?? "";
  const cookie = req.cookies.get("sesion")?.value; // cookie httpOnly de sesión (alternativa al Bearer)
  
  if (!header.startsWith("Bearer ") && !cookie) throw new HttpError(401, "Debes iniciar sesión.");
  
  let uid: string;
  try {
    uid = header.startsWith("Bearer ")
      ? (await adminAuth.verifyIdToken(header.slice(7), true)).uid
      : (await adminAuth.verifySessionCookie(cookie!, true)).uid; // revocable
  } catch {
    throw new HttpError(401, "Sesión inválida o expirada.");
  }

  const user = (await adminDb.doc(`users/${uid}`).get()).data();
  if (!user || user.status !== "active") throw new HttpError(403, "Cuenta inactiva o inexistente.");
  limitUser(uid, user.role); // rate limit por usuario
  if (!roles.includes(user.role)) throw new HttpError(403, "No tienes permiso para esta acción.");
  return { uid, name: String(user.name ?? ""), role: user.role };
}

/** Convierte cualquier error en respuesta JSON sin filtrar detalles internos. */
export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status, headers: e.headers });
  console.error(e);
  return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
}
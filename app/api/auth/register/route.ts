/**
 * POST /api/auth/register — CSRF + rate limit + verificación humana (CAPTCHA de texto) + correo con dominio EXISTENTE + correo de verificación.
 * Primero se VERIFICA y después se crea en la base de datos: aquí solo se crea un registro PENDIENTE (24 h); la cuenta entra a `users`
 * cuando el correo ya está verificado y la persona inicia sesión. Los registros sin verificar se eliminan solos.
 */
import { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok } from "@/lib/api/http";
import { guard } from "@/lib/antibot/guard";
import { requireHuman } from "@/lib/antibot/human";
import { enmascararCorreo } from "@/lib/antibot/events";
import { TERMINOS_VERSION } from "@/lib/antibot/config";
import { registerSchema } from "@/lib/validations/schemas";
import { dominioRecibeCorreo, enviarCorreoVerificacion } from "@/lib/auth/correo";
import { PENDIENTE_HORAS, limpiarPendientes } from "@/lib/auth/pendientes";
import { writeLog } from "@/lib/logs/logger";

export async function POST(req: NextRequest) {
  try {
    await guard(req, "auth");
    const b = await parse(req, registerSchema);
    await requireHuman(req, "text", b, { accion: "registro", datos: `nombre:${b.name.length}c correo:${b.email.split("@")[1] ?? "?"} términos:sí`,
      actor: { name: enmascararCorreo(b.email), role: "visitante" } });
    if ((await dominioRecibeCorreo(b.email)) === "no") throw new HttpError(400, "El dominio del correo no existe o no recibe mensajes. Usa un correo real.");
    await limpiarPendientes().catch(() => 0); // elimina los registros que nunca verificaron su correo

    let uid = "";
    for (let intento = 0; intento < 2 && !uid; intento++) {
      try { uid = (await adminAuth.createUser({ email: b.email, password: b.password, displayName: b.name, emailVerified: false })).uid; }
      catch (e: any) {
        if (intento === 0 && e?.code === "auth/email-already-exists") {
          // Un registro SIN verificar se reemplaza (así se puede corregir la contraseña o el correo mal escrito). Una cuenta verificada nunca se toca.
          const viejo = await adminAuth.getUserByEmail(b.email).catch(() => null);
          const pend = viejo ? await adminDb.doc(`registros_pendientes/${viejo.uid}`).get() : null;
          if (viejo && !viejo.emailVerified && pend?.exists) { await adminAuth.deleteUser(viejo.uid); await pend.ref.delete(); continue; }
        }
        throw new HttpError(400, "No se pudo crear la cuenta con esos datos."); // genérico: no revela si el correo ya existe
      }
    }
    await adminDb.doc(`registros_pendientes/${uid}`).set({
      uid, name: b.name, email: b.email, terminosVersion: TERMINOS_VERSION, terminosAceptadasEn: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + PENDIENTE_HORAS * 3_600_000),
    });
    const envio = await enviarCorreoVerificacion(b.email, b.password);
    await writeLog({ session: { uid, name: b.name, role: "user" }, action: "REGISTER", module: "auth", targetType: "user", targetId: uid, status: "success",
      description: `Registro pendiente de verificar el correo (correo de verificación ${envio === "enviado" ? "enviado" : "NO enviado"})` });
    return ok({ verificacion: envio === "enviado" });
  } catch (e) { return errorResponse(e); }
}
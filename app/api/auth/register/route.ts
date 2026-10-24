/**
 * POST /api/auth/register — rate limit + verificación humana (CAPTCHA de texto) + correo EXISTENTE (el dominio recibe correo)
 * + correo de verificación de Firebase. La cuenta nueva no podrá iniciar sesión hasta verificar su correo.
 */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok } from "@/lib/api/http";
import { guard } from "@/lib/antibot/guard";
import { requireHuman } from "@/lib/antibot/human";
import { enmascararCorreo } from "@/lib/antibot/events";
import { registerSchema } from "@/lib/validations/schemas";
import { dominioRecibeCorreo, enviarCorreoVerificacion } from "@/lib/auth/correo";
import { writeLog } from "@/lib/logs/logger";

export async function POST(req: NextRequest) {
  try {
    await guard(req, "auth");
    const b = await parse(req, registerSchema);
    await requireHuman(req, "text", b, { accion: "registro", datos: `nombre:${b.name.length}c correo:${b.email.split("@")[1] ?? "?"} términos:sí`,
      actor: { name: enmascararCorreo(b.email), role: "visitante" } });
    if ((await dominioRecibeCorreo(b.email)) === "no") throw new HttpError(400, "El dominio del correo no existe o no recibe mensajes. Usa un correo real.");

    let uid: string;
    try { uid = (await adminAuth.createUser({ email: b.email, password: b.password, displayName: b.name, emailVerified: false })).uid; }
    catch { throw new HttpError(400, "No se pudo crear la cuenta con esos datos."); } // genérico: no revela si el correo ya existe
    await adminDb.doc(`users/${uid}`).set({
      uid, name: b.name, email: b.email, role: "user", photoURL: "", photoPublicId: "", status: "active", requiereVerificacion: true,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastLoginAt: null,
    });
    const envio = await enviarCorreoVerificacion(b.email, b.password);
    await writeLog({ session: { uid, name: b.name, role: "user" }, action: "REGISTER", module: "auth", targetType: "user", targetId: uid, status: "success",
      description: `Usuario se registró (correo de verificación ${envio === "enviado" ? "enviado" : "NO enviado"})` });
    return ok({ verificacion: envio === "enviado" });
  } catch (e) { return errorResponse(e); }
}
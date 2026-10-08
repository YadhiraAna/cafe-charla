/**
 * POST /api/auth/register — valida CAPTCHA de texto ANTES de crear la cuenta.
 * La cuenta se crea con Admin SDK; la contraseña va solo a Firebase Auth (nunca a Firestore).
 */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok } from "@/lib/api/http";
import { guard } from "@/lib/antibot/guard";
import { requireHuman } from "@/lib/antibot/human";
import { registerSchema } from "@/lib/validations/schemas";
import { writeLog } from "@/lib/logs/logger";

export async function POST(req: NextRequest) {
  try {
    await guard(req, "auth");
    const b = await parse(req, registerSchema);
    await requireHuman(req, "text", b);
    let uid: string;
    try { uid = (await adminAuth.createUser({ email: b.email, password: b.password, displayName: b.name })).uid; }
    catch { throw new HttpError(400, "No se pudo crear la cuenta con esos datos."); } // genérico: no revela si el correo existe
    await adminDb.doc(`users/${uid}`).set({
      uid, name: b.name, email: b.email, role: "user", photoURL: "", photoPublicId: "", status: "active",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastLoginAt: null,
    });
    await writeLog({ session: { uid, name: b.name, role: "user" }, action: "REGISTER", module: "auth", targetType: "user", targetId: uid, status: "success", description: "Usuario se registró" });
    return ok();
  } catch (e) { return errorResponse(e); }
}

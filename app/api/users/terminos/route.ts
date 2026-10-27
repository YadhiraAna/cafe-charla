/** POST /api/users/me/terminos — la persona acepta la versión vigente de Términos y Privacidad. La versión la valida el servidor. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse } from "@/lib/auth/server";
import { parse, ok, ALL } from "@/lib/api/http";
import { TERMINOS_VERSION } from "@/lib/antibot/config";
import { writeLog } from "@/lib/logs/logger";

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(req, ALL);
    const { version } = await parse(req, z.object({ version: z.literal(TERMINOS_VERSION), acepto: z.literal(true) }));
    await adminDb.doc(`users/${s.uid}`).update({ terminosVersion: version, terminosAceptadasEn: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await writeLog({ session: s, action: "UPDATE", module: "users", targetType: "user", targetId: s.uid, status: "success", description: `Aceptó términos y privacidad (versión ${version})` });
    return ok();
  } catch (e) { return errorResponse(e); }
}
/** PATCH /api/admin/users/:uid — solo admin: cambiar rol o activar/desactivar. No puede modificarse a sí mismo. */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError, invalidarUsuario } from "@/lib/auth/server";
import { parse, ok } from "@/lib/api/http";
import { userAdminSchema, docId } from "@/lib/validations/schemas";
import { writeLog } from "@/lib/logs/logger";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> | { uid: string } }) {
  try {
    const s = await requireRole(req, ["admin"]);
    const resolvedParams = await params;
    const uid = docId.parse(resolvedParams.uid);
    if (uid === s.uid) throw new HttpError(400, "No puedes modificar tu propio rol o estado.");
    const ref = adminDb.doc(`users/${uid}`), snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "Usuario no encontrado.");
    const body = await parse(req, userAdminSchema);
    await ref.update({ ...body, updatedAt: FieldValue.serverTimestamp() });
    invalidarUsuario(uid);
    if (body.status) {
      await adminAuth.updateUser(uid, { disabled: body.status === "disabled" });
      if (body.status === "disabled") await adminAuth.revokeRefreshTokens(uid);
    }
    if (body.role) await writeLog({ session: s, action: "ROLE_CHANGE", module: "users", targetType: "user", targetId: uid, status: "success", description: `Rol de ${snap.data()!.name}: ${snap.data()!.role} → ${body.role}` });
    if (body.status) await writeLog({ session: s, action: "TOGGLE", module: "users", targetType: "user", targetId: uid, status: "success", description: `Estado de ${snap.data()!.name}: ${body.status}` });
    return ok();
  } catch (e) { return errorResponse(e); }
}
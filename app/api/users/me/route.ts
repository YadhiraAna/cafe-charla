/** PATCH /api/users/me — el usuario edita SOLO name/foto. role, uid, email, status no son editables. */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse } from "@/lib/auth/server";
import { parse, ok, ALL } from "@/lib/api/http";
import { profileSchema } from "@/lib/validations/schemas";
import { deleteImage } from "@/lib/cloudinary/server";
import { writeLog } from "@/lib/logs/logger";

export async function PATCH(req: NextRequest) {
  try {
    const s = await requireRole(req, ALL);
    const body = await parse(req, profileSchema);
    const ref = adminDb.doc(`users/${s.uid}`), old = (await ref.get()).data()!;
    const photoChanged = body.photoPublicId !== undefined && body.photoPublicId !== old.photoPublicId;
    if (photoChanged) await deleteImage(old.photoPublicId);
    await ref.update({ ...body, updatedAt: FieldValue.serverTimestamp() });
    if (body.name || body.photoURL !== undefined) await adminAuth.updateUser(s.uid, { ...(body.name && { displayName: body.name }), ...(body.photoURL !== undefined && { photoURL: body.photoURL || null }) });
    await writeLog({ session: s, action: "UPDATE", module: "users", targetType: "user", targetId: s.uid, status: "success", description: photoChanged ? "Cambió su foto de perfil" : "Actualizó su perfil" });
    return ok();
  } catch (e) { return errorResponse(e); }
}

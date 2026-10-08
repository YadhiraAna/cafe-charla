/** POST /api/moderation — moderador/admin cambia el estado (published|pending|hidden). */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok, MOD } from "@/lib/api/http";
import { moderationSchema } from "@/lib/validations/schemas";
import { writeLog } from "@/lib/logs/logger";

const COL = { post: "posts", comment: "comments", review: "reviews" } as const;

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(req, MOD);
    const { type, id, status } = await parse(req, moderationSchema);
    const ref = adminDb.doc(`${COL[type]}/${id}`), snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "No encontrado.");
    const prev = snap.data()!.status;
    await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
    const action = status === "hidden" ? "HIDE" : prev === "hidden" && status === "published" ? "RESTORE" : "MODERATE";
    await writeLog({ session: s, action, module: "moderation", targetType: type, targetId: id, status: "success", description: `Cambió ${type} de ${prev} a ${status}` });
    return ok();
  } catch (e) { return errorResponse(e); }
}

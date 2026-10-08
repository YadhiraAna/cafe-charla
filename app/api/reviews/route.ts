/** POST /api/reviews — una reseña por usuario (id = uid). CAPTCHA de selección. */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok, ALL } from "@/lib/api/http";
import { requireHuman } from "@/lib/antibot/human";
import { reviewCreate } from "@/lib/validations/schemas";
import { writeLog } from "@/lib/logs/logger";

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(req, ALL);
    const { captchaToken, captchaAnswer, antibot, ...data } = await parse(req, reviewCreate);
    await requireHuman(req, "select", { captchaToken, captchaAnswer, antibot }, s.uid);
    const ref = adminDb.doc(`reviews/${s.uid}`);
    if ((await ref.get()).exists) throw new HttpError(409, "Ya publicaste una reseña. Puedes editarla o eliminarla.");
    await ref.set({ ...data, authorId: s.uid, authorName: s.name, status: "published", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await writeLog({ session: s, action: "CREATE", module: "reviews", targetType: "review", targetId: ref.id, status: "success", description: "Usuario creó una reseña" });
    return ok({ id: ref.id });
  } catch (e) { return errorResponse(e); }
}

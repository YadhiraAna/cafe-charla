/** POST /api/comments — comentar (sesión + CAPTCHA de pregunta). Solo en publicaciones publicadas. */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok, ALL } from "@/lib/api/http";
import { requireHuman } from "@/lib/antibot/human";
import { commentCreate } from "@/lib/validations/schemas";
import { writeLog } from "@/lib/logs/logger";
import { exigirTicketForo } from "@/lib/tickets/servicio";

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(req, ALL);
    const { captchaToken, captchaAnswer, antibot, ...data } = await parse(req, commentCreate);
    await exigirTicketForo(s, "comment");
    await requireHuman(req, "question", { captchaToken, captchaAnswer, antibot }, { accion: "crear_comentario", datos: `contenido:${data.content.length}c`, actor: { uid: s.uid, name: s.name, role: s.role } });
    const post = await adminDb.doc(`posts/${data.postId}`).get();
    if (!post.exists || post.data()!.status !== "published") throw new HttpError(404, "La publicación no está disponible.");
    const ref = await adminDb.collection("comments").add({
      ...data, authorId: s.uid, authorName: s.name, status: "published",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await writeLog({ session: s, action: "CREATE", module: "forum", targetType: "comment", targetId: ref.id, status: "success", description: "Usuario creó un comentario" });
    return ok({ id: ref.id });
  } catch (e) { return errorResponse(e); }
}
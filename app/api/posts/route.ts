/** POST /api/posts — crear publicación (sesión + CAPTCHA de imágenes). */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse } from "@/lib/auth/server";
import { parse, ok, ALL } from "@/lib/api/http";
import { requireHuman } from "@/lib/antibot/human";
import { postCreate } from "@/lib/validations/schemas";
import { writeLog } from "@/lib/logs/logger";
import { exigirTicketForo } from "@/lib/tickets/servicio";

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(req, ALL);
    const { captchaToken, captchaAnswer, antibot, ...data } = await parse(req, postCreate);
    await exigirTicketForo(s, "post");
    await requireHuman(req, "images", { captchaToken, captchaAnswer, antibot }, { accion: "crear_publicacion", datos: `título:${data.title.length}c contenido:${data.content.length}c imagen:${data.imageUrl ? "sí" : "no"}`, actor: { uid: s.uid, name: s.name, role: s.role } });
    const ref = await adminDb.collection("posts").add({
      ...data, authorId: s.uid, authorName: s.name, status: "published",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await writeLog({ session: s, action: "CREATE", module: "forum", targetType: "post", targetId: ref.id, status: "success", description: "Usuario creó una publicación" });
    return ok({ id: ref.id });
  } catch (e) { return errorResponse(e); }
}
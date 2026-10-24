/**
 * PATCH  /api/reviews/:id — actualiza la reseña SOLO si fecha_ultimo_consumo > fecha_ultima_reseña (hay un consumo posterior).
 * DELETE /api/reviews/:id — el autor o un moderador/admin la eliminan. Las reseñas con ticket se marcan "deleted" (no se borran)
 *                           para que borrar y republicar NO sirva para saltarse la regla. Las anteriores al sistema de tickets sí se borran.
 */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok, ALL, MOD } from "@/lib/api/http";
import { requireHuman } from "@/lib/antibot/human";
import { docId } from "@/lib/validations/schemas";
import { resenaActualizar } from "@/lib/validations/tickets";
import { MSG, estadoResena, ultimoConsumo } from "@/lib/tickets/reglas";
import { consumosDe } from "@/lib/tickets/servicio";
import { writeLog } from "@/lib/logs/logger";

const ms = (t: any): number => (t?.toMillis ? t.toMillis() : 0);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(req, ALL);
    const id = docId.parse(params.id);
    const { captchaToken, captchaAnswer, antibot, rating, content } = await parse(req, resenaActualizar);
    await requireHuman(req, "select", { captchaToken, captchaAnswer, antibot },
      { accion: "actualizar_resena", datos: `calificación:${rating} contenido:${content.length}c`, actor: { uid: s.uid, name: s.name, role: s.role } });
    const ref = adminDb.doc(`reviews/${id}`);
    try {
      await adminDb.runTransaction(async tx => {
        const rs = await tx.get(ref);
        if (!rs.exists) throw new HttpError(404, "No encontrado.");
        const r = rs.data()!;
        if (r.authorId !== s.uid) throw new HttpError(403, "Solo puedes editar tu propia reseña.");
        if (!r.productId) throw new HttpError(403, "Esta reseña es anterior al sistema de tickets y ya no se puede editar. Puedes eliminarla y publicar una nueva con un ticket.");
        if (!["published", "pending"].includes(r.status)) throw new HttpError(403, "Esta reseña no se puede editar.");
        const consumos = await consumosDe(s.uid, tx);
        const est = estadoResena(ultimoConsumo(consumos, r.productId), { status: r.status, lastReviewedMs: ms(r.lastReviewedAt ?? r.createdAt) });
        if (est === "sin_consumo") throw new HttpError(403, MSG.noConsumido);
        if (est !== "puede_actualizar") throw new HttpError(403, MSG.volverConsumir);
        tx.update(ref, { rating, content, updatedAt: FieldValue.serverTimestamp(), lastReviewedAt: FieldValue.serverTimestamp() });
      });
    } catch (e) {
      if (e instanceof HttpError) await writeLog({ session: s, action: "UPDATE", module: "reviews", targetType: "review", targetId: id, status: "denied", description: `Actualización rechazada: ${e.message}` });
      throw e;
    }
    await writeLog({ session: s, action: "UPDATE", module: "reviews", targetType: "review", targetId: id, status: "success", description: "Reseña actualizada tras un nuevo consumo" });
    return ok();
  } catch (e) { return errorResponse(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(req, ALL);
    const id = docId.parse(params.id);
    const ref = adminDb.doc(`reviews/${id}`), snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "No encontrado.");
    const r = snap.data()!, own = r.authorId === s.uid;
    if (!own && !MOD.includes(s.role)) throw new HttpError(403, "No puedes eliminar contenido de otros usuarios.");
    if (r.productId) await ref.update({ status: "deleted", content: "", updatedAt: FieldValue.serverTimestamp() }); // conserva lastReviewedAt
    else await ref.delete();
    await writeLog({ session: s, action: "DELETE", module: own ? "reviews" : "moderation", targetType: "review", targetId: id, status: "success", description: own ? "Eliminó su reseña" : "Eliminó reseña de otro usuario" });
    return ok();
  } catch (e) { return errorResponse(e); }
}
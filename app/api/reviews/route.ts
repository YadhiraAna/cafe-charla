/**
 * POST /api/reviews — publica la reseña de UN producto consumido (una por producto: id = uid__productId).
 * Exige: sesión + CAPTCHA de selección + telemetría anti-bot + haber canjeado un ticket que incluya ese producto.
 */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok, ALL } from "@/lib/api/http";
import { requireHuman } from "@/lib/antibot/human";
import { resenaCrear } from "@/lib/validations/tickets";
import { MSG, estadoResena, ultimoConsumo } from "@/lib/tickets/reglas";
import { consumosDe } from "@/lib/tickets/servicio";
import { writeLog } from "@/lib/logs/logger";

const ms = (t: any): number => (t?.toMillis ? t.toMillis() : 0);

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(req, ALL);
    const { captchaToken, captchaAnswer, antibot, productId, rating, content } = await parse(req, resenaCrear);
    await requireHuman(req, "select", { captchaToken, captchaAnswer, antibot },
      { accion: "crear_resena", datos: `calificación:${rating} contenido:${content.length}c`, actor: { uid: s.uid, name: s.name, role: s.role } });

    const prod = await adminDb.doc(`menu/${productId}`).get();
    if (!prod.exists) throw new HttpError(404, "El producto no existe.");
    const ref = adminDb.doc(`reviews/${s.uid}__${productId}`);
    try {
      await adminDb.runTransaction(async tx => {
        const [rs, consumos] = await Promise.all([tx.get(ref), consumosDe(s.uid, tx)]);
        const r = rs.exists ? rs.data()! : null;
        const est = estadoResena(ultimoConsumo(consumos, productId), r ? { status: r.status, lastReviewedMs: ms(r.lastReviewedAt ?? r.createdAt) } : null);
        if (est === "sin_consumo") throw new HttpError(403, MSG.noConsumido);
        if (est !== "puede_publicar") throw new HttpError(409, est === "puede_actualizar" ? `${MSG.yaResenado} Puedes actualizarla.` : `${MSG.yaResenado} ${MSG.volverConsumir}`);
        tx.set(ref, { authorId: s.uid, authorName: s.name, productId, product: String(prod.data()!.name), rating, content, status: "published",
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastReviewedAt: FieldValue.serverTimestamp() });
      });
    } catch (e) {
      if (e instanceof HttpError) await writeLog({ session: s, action: "CREATE", module: "reviews", targetType: "review", targetId: ref.id, status: "denied", description: `Reseña rechazada: ${e.message}` });
      throw e;
    }
    await writeLog({ session: s, action: "CREATE", module: "reviews", targetType: "review", targetId: ref.id, status: "success", description: `Usuario reseñó "${String(prod.data()!.name).slice(0, 60)}"` });
    return ok({ id: ref.id });
  } catch (e) { return errorResponse(e); }
}
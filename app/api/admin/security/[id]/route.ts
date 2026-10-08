/** PATCH /api/admin/security/:id — el admin etiqueta un evento como "bot" o "falso positivo (humano)". Alimenta la tasa de FP del panel. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok } from "@/lib/api/http";
import { docId } from "@/lib/validations/schemas";
import { writeLog } from "@/lib/logs/logger";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(req, ["admin"]);
    const id = docId.parse(params.id);
    const { review } = await parse(req, z.object({ review: z.enum(["bot", "human"]).nullable() }));
    const ref = adminDb.doc(`security_events/${id}`);
    if (!(await ref.get()).exists) throw new HttpError(404, "Evento no encontrado.");
    await ref.update({ review, reviewedBy: s.uid });
    await writeLog({ session: s, action: "UPDATE", module: "security", targetType: "security_event", targetId: id, status: "success", description: `Evento marcado como ${review ?? "sin revisar"}` });
    return ok();
  } catch (e) { return errorResponse(e); }
}

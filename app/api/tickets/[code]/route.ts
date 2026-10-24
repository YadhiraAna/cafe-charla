/** PATCH /api/tickets/:code — cancela un ticket (el mesero que lo generó o un administrador). */
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { ok } from "@/lib/api/http";
import { docId } from "@/lib/validations/schemas";
import { writeLog } from "@/lib/logs/logger";

export async function PATCH(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const s = await requireRole(req, ["waiter", "admin"]);
    const code = docId.parse(params.code);
    const ref = adminDb.doc(`tickets/${code}`), snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "Ticket no encontrado.");
    if (s.role === "waiter" && snap.data()!.waiterId !== s.uid) throw new HttpError(403, "Solo puedes cancelar tus propios tickets.");
    await ref.update({ status: "cancelled" });
    await writeLog({ session: s, action: "TICKET_CANCEL", module: "tickets", targetType: "ticket", targetId: code, status: "success", description: "Ticket cancelado" });
    return ok();
  } catch (e) { return errorResponse(e); }
}
/** POST /api/tickets — SOLO rol Mesero. Genera un ticket de consumo con código único. */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { parse } from "@/lib/api/http";
import { ticketCreate } from "@/lib/validations/tickets";
import { TTL_HORAS, fechaConsumoInvalida } from "@/lib/tickets/reglas";
import { canjearTicket, nuevoCodigo, ItemTicket } from "@/lib/tickets/servicio";
import { writeLog } from "@/lib/logs/logger";

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(req, ["waiter"]);
    const b = await parse(req, ticketCreate);
    const ahora = Date.now();
    let consumidoMs = ahora;
    if (b.modoFecha === "manual") {
      if (!b.consumidoEn) throw new HttpError(400, "Indica la fecha y hora del consumo.");
      consumidoMs = Date.parse(b.consumidoEn);
    }
    const errFecha = fechaConsumoInvalida(consumidoMs, ahora);
    if (errFecha) throw new HttpError(400, errFecha);

    const ids = Array.from(new Set(b.productos));
    const snaps = await adminDb.getAll(...ids.map(id => adminDb.doc(`menu/${id}`)));
    if (snaps.some(x => !x.exists)) throw new HttpError(400, "Hay productos que no existen en el menú.");
    const items: ItemTicket[] = snaps.map(x => ({ productId: x.id, name: String(x.data()!.name) }));

    const expiresMs = ahora + TTL_HORAS * 3_600_000;
    let code = "";
    for (let i = 0; i < 6 && !code; i++) {
      const c = nuevoCodigo();
      try {
        await adminDb.doc(`tickets/${c}`).create({ code: c, waiterId: s.uid, waiterName: s.name, consumedAt: Timestamp.fromMillis(consumidoMs), consumoModo: b.modoFecha,
          items, people: b.personas, maxUses: b.personas, uses: 0, status: "active", expiresAt: Timestamp.fromMillis(expiresMs), createdAt: FieldValue.serverTimestamp() });
        code = c;
      } catch (e: any) { if (e?.code !== 6) throw e; } // 6 = ALREADY_EXISTS: se prueba con otro código
    }
    if (!code) throw new HttpError(500, "No se pudo generar un código único. Inténtalo de nuevo.");

    let asociado = false;
    if (b.correoCliente) {
      try {
        const au = await adminAuth.getUserByEmail(b.correoCliente), u = (await adminDb.doc(`users/${au.uid}`).get()).data();
        if (u && u.status === "active") { await canjearTicket(code, { uid: au.uid, name: u.name }); asociado = true; }
      } catch { /* no hay cuenta con ese correo: el ticket queda libre para que el cliente lo canjee al registrarse */ }
    }
    await writeLog({ session: s, action: "TICKET_CREATE", module: "tickets", targetType: "ticket", targetId: code, status: "success",
      description: `Mesero generó ticket: ${items.length} producto(s), ${b.personas} persona(s), consumo ${b.modoFecha === "auto" ? "automático" : "manual"}${asociado ? ", asociado a cuenta existente" : ""}` });
    return NextResponse.json({ ok: true, code, consumedAtMs: consumidoMs, expiresAtMs: expiresMs, items, people: b.personas, uses: asociado ? 1 : 0, maxUses: b.personas, asociado });
  } catch (e) { return errorResponse(e); }
}
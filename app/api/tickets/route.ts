/** POST /api/tickets — SOLO rol Cajero. Primero se VERIFICA todo (productos, fecha, correo) y solo entonces se crea el ticket. */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { parse } from "@/lib/api/http";
import { enmascararCorreo } from "@/lib/antibot/events";
import { ticketCreate } from "@/lib/validations/tickets";
import { MAX_CANTIDAD, TTL_HORAS, fechaConsumoInvalida } from "@/lib/tickets/reglas";
import { canjearTicket, hashCorreo, nuevoCodigo, ItemTicket, Persona } from "@/lib/tickets/servicio";
import { dominioRecibeCorreo } from "@/lib/auth/correo";
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

    // 1) Productos: deben existir en el menú. Si un producto se repite, se suman sus cantidades.
    const cantidades = new Map<string, number>();
    for (const p of b.productos) cantidades.set(p.id, Math.min(MAX_CANTIDAD, (cantidades.get(p.id) ?? 0) + p.cantidad));
    const ids = Array.from(cantidades.keys());
    const snaps = await adminDb.getAll(...ids.map(id => adminDb.doc(`menu/${id}`)));
    if (snaps.some(x => !x.exists)) throw new HttpError(400, "Hay productos que no existen en el menú.");
    const items: ItemTicket[] = snaps.map(x => ({ productId: x.id, name: String(x.data()!.name), qty: cantidades.get(x.id)! }));

    // 2) Correo del cliente (opcional): se verifica ANTES de crear nada.
    const correo = b.correoCliente || "";
    let cuenta: Persona | null = null;
    if (correo) {
      try {
        const au = await adminAuth.getUserByEmail(correo), u = (await adminDb.doc(`users/${au.uid}`).get()).data();
        if (u && u.status === "active") cuenta = { uid: au.uid, name: u.name, email: correo, role: u.role };
      } catch { /* todavía no hay cuenta con ese correo */ }
      if (!cuenta && (await dominioRecibeCorreo(correo)) === "no")
        throw new HttpError(400, "El correo del cliente no es válido: su dominio no existe o no recibe mensajes. Revísalo antes de generar el ticket.");
    }

    // 3) Ya verificado todo: se crea el ticket. Si el correo aún no tiene cuenta, se APARTA un lugar para esa persona.
    const invitado = correo && !cuenta, mascara = invitado ? enmascararCorreo(correo) : "";
    const expiresMs = ahora + TTL_HORAS * 3_600_000;
    let code = "";
    for (let i = 0; i < 6 && !code; i++) {
      const c = nuevoCodigo();
      try {
        await adminDb.doc(`tickets/${c}`).create({ code: c, waiterId: s.uid, waiterName: s.name, consumedAt: Timestamp.fromMillis(consumidoMs), consumoModo: b.modoFecha,
          items, people: b.personas, maxUses: b.personas, uses: 0, participantes: [], status: "active", expiresAt: Timestamp.fromMillis(expiresMs), createdAt: FieldValue.serverTimestamp(),
          ...(invitado ? { invitedHash: hashCorreo(correo), invitedMask: mascara, reservado: 1 } : { reservado: 0 }) });
        code = c;
      } catch (e: any) { if (e?.code !== 6) throw e; } // 6 = ALREADY_EXISTS: se prueba con otro código
    }
    if (!code) throw new HttpError(500, "No se pudo generar un código único. Inténtalo de nuevo.");

    // 4) Si la persona ya tiene cuenta (ya inició sesión alguna vez), se vincula al instante y ocupa 1 lugar.
    let vinculado = null as Awaited<ReturnType<typeof canjearTicket>> | null;
    if (cuenta) vinculado = await canjearTicket(code, cuenta);
    await writeLog({ session: s, action: "TICKET_CREATE", module: "tickets", targetType: "ticket", targetId: code, status: "success",
      description: `Cajero generó ticket: ${items.reduce((a, i) => a + i.qty, 0)} pieza(s) de ${items.length} producto(s), ${b.personas} persona(s), consumo ${b.modoFecha === "auto" ? "automático" : "manual"}${cuenta ? ", vinculado a cuenta existente" : invitado ? `, lugar apartado para ${mascara}` : ""}` });
    return NextResponse.json({ ok: true, code, consumedAtMs: consumidoMs, expiresAtMs: expiresMs, items, people: b.personas, uses: vinculado?.uses ?? 0, maxUses: b.personas,
      participantes: cuenta ? [{ nombre: cuenta.name, correo: enmascararCorreo(correo), enMs: Date.now() }] : [], pendiente: mascara, asociado: !!cuenta });
  } catch (e) { return errorResponse(e); }
}
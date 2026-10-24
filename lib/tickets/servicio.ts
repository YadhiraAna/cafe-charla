/** Servicio de tickets (solo servidor): códigos únicos, canje ATÓMICO y consumos de un usuario. */
import "server-only";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { HttpError } from "@/lib/http-error";
import { ALFABETO, ConsumoLite, LONGITUD, PREFIJO, puedeCanjear } from "@/lib/tickets/reglas";

export const nuevoCodigo = () => PREFIJO + Array.from({ length: LONGITUD }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("");

export interface ItemTicket { productId: string; name: string }
export interface Canjeado { code: string; items: ItemTicket[]; consumedAtMs: number; people: number; uses: number; maxUses: number }

/** Asocia el ticket al usuario dentro de UNA transacción: el límite de personas y el "no repetir" no se pueden saltar con peticiones simultáneas. */
export async function canjearTicket(code: string, user: { uid: string; name: string }): Promise<Canjeado> {
  const tref = adminDb.doc(`tickets/${code}`), cref = adminDb.doc(`ticket_claims/${code}__${user.uid}`);
  return adminDb.runTransaction(async tx => {
    const [ts, cs] = await Promise.all([tx.get(tref), tx.get(cref)]);
    const t = ts.exists ? ts.data()! : null;
    const r = puedeCanjear(t ? { status: t.status, uses: t.uses, maxUses: t.maxUses, expiresAtMs: t.expiresAt.toMillis() } : null, cs.exists, Date.now());
    if (!r.ok) throw new HttpError(r.motivo === "no_existe" ? 404 : 409, r.mensaje);
    tx.update(tref, { uses: FieldValue.increment(1) });
    tx.set(cref, { ticketCode: code, userId: user.uid, userName: user.name, claimedAt: FieldValue.serverTimestamp(),
      consumedAt: t!.consumedAt, items: t!.items, people: t!.people, waiterId: t!.waiterId });
    return { code, items: t!.items as ItemTicket[], consumedAtMs: t!.consumedAt.toMillis() as number, people: t!.people as number,
      uses: (t!.uses as number) + 1, maxUses: t!.maxUses as number };
  });
}

/** Todos los consumos del usuario (uno por producto y visita), leídos de su historial de tickets canjeados. */
export async function consumosDe(uid: string, tx?: Transaction): Promise<ConsumoLite[]> {
  const q = adminDb.collection("ticket_claims").where("userId", "==", uid).limit(500);
  const snap = tx ? await tx.get(q) : await q.get();
  return snap.docs.flatMap(d => { const c = d.data(); return (c.items as ItemTicket[]).map(i => ({ productId: i.productId, consumidoMs: c.consumedAt.toMillis() as number })); });
}
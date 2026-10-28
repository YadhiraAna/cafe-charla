/** Servicio de tickets (solo servidor): códigos únicos, canje ATÓMICO, vinculación automática de invitados y consumos de un usuario. */
import "server-only";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { HttpError } from "@/lib/http-error";
import { enmascararCorreo } from "@/lib/antibot/events";
import { writeLog } from "@/lib/logs/logger";
import type { Session } from "@/lib/auth/server";
import { ALFABETO, ConsumoLite, LONGITUD, MSG_FORO, PREFIJO, necesitaTicketParaForo, puedeCanjear } from "@/lib/tickets/reglas";

export const nuevoCodigo = () => PREFIJO + Array.from({ length: LONGITUD }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("");
/** Huella irreversible del correo (HMAC): reconoce a la persona invitada sin guardar su correo completo en el ticket. */
export const hashCorreo = (c: string) => crypto.createHmac("sha256", process.env.CAPTCHA_SECRET ?? "").update(`tk:${c.trim().toLowerCase()}`).digest("hex");

export interface ItemTicket { productId: string; name: string; qty: number }
export interface Canjeado { code: string; items: ItemTicket[]; consumedAtMs: number; people: number; uses: number; maxUses: number }
export interface Persona { uid: string; name: string; email?: string; role?: string }

/** Asocia el ticket al usuario dentro de UNA transacción: el límite de personas, los lugares apartados y el "no repetir" no se saltan con peticiones simultáneas. */
export async function canjearTicket(code: string, user: Persona): Promise<Canjeado> {
  const tref = adminDb.doc(`tickets/${code}`), cref = adminDb.doc(`ticket_claims/${code}__${user.uid}`);
  return adminDb.runTransaction(async tx => {
    const [ts, cs] = await Promise.all([tx.get(tref), tx.get(cref)]);
    const t = ts.exists ? ts.data()! : null;
    const esInvitado = !!(t && t.invitedHash && user.email && t.invitedHash === hashCorreo(user.email));
    const r = puedeCanjear(t ? { status: t.status, uses: t.uses, maxUses: t.maxUses, expiresAtMs: t.expiresAt.toMillis(), reservado: t.reservado ?? 0 } : null, cs.exists, Date.now(), esInvitado);
    if (!r.ok) throw new HttpError(r.motivo === "no_existe" ? 404 : 409, r.mensaje);
    const items = (t!.items as ItemTicket[]).map(i => ({ ...i, qty: i.qty ?? 1 }));
    tx.update(tref, {
      uses: FieldValue.increment(1),
      participantes: FieldValue.arrayUnion({ nombre: user.name, correo: user.email ? enmascararCorreo(user.email) : "", enMs: Date.now() }),
      ...(esInvitado ? { reservado: 0, invitedUid: user.uid } : {}), // al vincularse, su lugar apartado deja de estar "reservado" y pasa a estar usado
    });
    tx.set(cref, { ticketCode: code, userId: user.uid, userName: user.name, claimedAt: FieldValue.serverTimestamp(), consumedAt: t!.consumedAt, items, people: t!.people, waiterId: t!.waiterId });
    return { code, items, consumedAtMs: t!.consumedAt.toMillis() as number, people: t!.people as number, uses: (t!.uses as number) + 1, maxUses: t!.maxUses as number };
  });
}

/** Al iniciar sesión (con el correo ya verificado) vincula AUTOMÁTICAMENTE los tickets que el cajero creó para ese correo antes de que existiera la cuenta. */
export async function vincularPendientes(user: Persona): Promise<number> {
  if (!user.email) return 0;
  const snap = await adminDb.collection("tickets").where("invitedHash", "==", hashCorreo(user.email)).limit(20).get();
  let n = 0;
  for (const d of snap.docs) {
    const t = d.data();
    if (t.status !== "active" || t.invitedUid) continue;
    try {
      await canjearTicket(d.id, user); n++;
      await writeLog({ session: { uid: user.uid, name: user.name, role: (user.role ?? "user") as any }, action: "TICKET_CLAIM", module: "tickets", targetType: "ticket", targetId: d.id, status: "success",
        description: "Ticket vinculado automáticamente al iniciar sesión (correo indicado por el cajero)" });
    } catch { /* vencido, lleno o ya vinculado: se omite */ }
  }
  return n;
}

/** Todos los consumos del usuario (uno por producto y visita), leídos de su historial de tickets canjeados. */
export async function consumosDe(uid: string, tx?: Transaction): Promise<ConsumoLite[]> {
  const q = adminDb.collection("ticket_claims").where("userId", "==", uid).limit(500);
  const snap = tx ? await tx.get(q) : await q.get();
  return snap.docs.flatMap(d => { const c = d.data(); return (c.items as ItemTicket[]).map(i => ({ productId: i.productId, consumidoMs: c.consumedAt.toMillis() as number })); });
}

/** Foro: para publicar o comentar hay que haber canjeado al menos un ticket (moderadores y administradores quedan exentos). */
export async function exigirTicketForo(s: Session, accion: "post" | "comment"): Promise<void> {
  if (!necesitaTicketParaForo(s.role)) return;
  const q = await adminDb.collection("ticket_claims").where("userId", "==", s.uid).limit(1).get();
  if (!q.empty) return;
  await writeLog({ session: s, action: "CREATE", module: "forum", targetType: accion, status: "denied", description: "Intento de participar en el foro sin ningún ticket canjeado" });
  throw new HttpError(403, MSG_FORO);
}
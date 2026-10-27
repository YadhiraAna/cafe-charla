/** Registros pendientes de verificar: la cuenta NO existe en `users` hasta que el correo se verifique y la persona inicie sesión. */
import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const PENDIENTE_HORAS = 24;

/** Borra las cuentas que nunca verificaron su correo (usuario de Auth + registro pendiente) pasadas 24 h. Se ejecuta en cada registro. */
export async function limpiarPendientes(): Promise<number> {
  const vencidos = await adminDb.collection("registros_pendientes").where("expiresAt", "<", Timestamp.now()).limit(20).get();
  let n = 0;
  for (const d of vencidos.docs) {
    try {
      const au = await adminAuth.getUser(d.id);
      if (au.emailVerified) { await d.ref.update({ expiresAt: Timestamp.fromMillis(Date.now() + 365 * 86_400_000) }); continue; } // ya verificó: solo falta que inicie sesión
      await adminAuth.deleteUser(d.id);
    } catch { /* ya no existe en Auth */ }
    await d.ref.delete(); n++;
  }
  return n;
}
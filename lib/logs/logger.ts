/** Auditoría: escribe en la colección `logs` solo desde el servidor. Nunca lanza errores. */
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { Session } from "@/lib/auth/server";

export interface LogInput {
  session?: Session | null;                 // null = visitante/sistema
  userName?: string;                        // para login fallido, registro, etc.
  userId?: string; userRole?: string;       // identidad de sistema (p. ej. Selenium)
  action: "CREATE" | "UPDATE" | "DELETE" | "HIDE" | "RESTORE" | "MODERATE" | "LOGIN" | "LOGOUT"
        | "REGISTER" | "PASSWORD_RESET" | "ROLE_CHANGE" | "TOGGLE" | "SCRAPING" | "UPLOAD" | "SECURITY";
  module: "auth" | "users" | "forum" | "reviews" | "menu" | "promotions" | "moderation" | "selenium" | "images" | "security";
  targetType?: string; targetId?: string;
  status: "success" | "error" | "denied";
  description: string;                      // NUNCA incluir contraseñas, tokens ni secretos
}

export async function writeLog(l: LogInput): Promise<void> {
  try {
    await adminDb.collection("logs").add({
      userId: l.session?.uid ?? l.userId ?? "anonymous",
      userName: l.session?.name ?? l.userName ?? "Visitante",
      userRole: l.session?.role ?? l.userRole ?? "visitor",
      action: l.action, module: l.module,
      targetType: l.targetType ?? "", targetId: l.targetId ?? "",
      status: l.status,
      description: l.description.slice(0, 300),
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e) { console.error("[logs] no se pudo escribir el log", e); }
}

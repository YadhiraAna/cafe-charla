/** POST /api/auth/reset — envía correo de recuperación. Respuesta SIEMPRE genérica (no revela si la cuenta existe). */
import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/auth/server";
import { parse, ok } from "@/lib/api/http";
import { guard } from "@/lib/antibot/guard";
import { resetSchema } from "@/lib/validations/schemas";
import { writeLog } from "@/lib/logs/logger";

export async function POST(req: NextRequest) {
  try {
    await guard(req, "auth");
    const { email } = await parse(req, resetSchema);
    try {
      await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Firebase-Locale": "es" }, body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
      });
    } catch (e) { console.error("[reset]", e); }
    await writeLog({ userName: email, action: "PASSWORD_RESET", module: "auth", status: "success", description: "Solicitud de recuperación de contraseña" });
    return ok({ message: "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña." });
  } catch (e) { return errorResponse(e); }
}

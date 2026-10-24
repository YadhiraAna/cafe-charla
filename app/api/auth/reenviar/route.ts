/** POST /api/auth/reenviar — reenvía el correo de verificación. Respuesta siempre genérica; solo actúa con credenciales correctas y respeta el bloqueo por fallos. */
import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok } from "@/lib/api/http";
import { guard } from "@/lib/antibot/guard";
import { lockedFor, recordFailure } from "@/lib/antibot/ratelimit";
import { LOGIN_LOCK } from "@/lib/antibot/config";
import { enviarCorreoVerificacion } from "@/lib/auth/correo";

const esquema = z.object({ email: z.string().trim().toLowerCase().email().max(120), password: z.string().min(1).max(72) });

export async function POST(req: NextRequest) {
  try {
    await guard(req, "auth");
    const { email, password } = await parse(req, esquema);
    const llave = `mail:${email}`, espera = lockedFor(llave);
    if (espera > 0) throw new HttpError(429, "Demasiados intentos. Inténtalo más tarde.", { "Retry-After": String(espera) });
    if ((await enviarCorreoVerificacion(email, password)) === "credenciales") recordFailure(llave, LOGIN_LOCK);
    return ok({ message: "Si los datos son correctos, te enviamos un nuevo enlace de verificación." });
  } catch (e) { return errorResponse(e); }
}
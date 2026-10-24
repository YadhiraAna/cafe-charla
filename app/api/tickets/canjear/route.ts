/**
 * POST /api/tickets/canjear — el cliente asocia un ticket a su cuenta.
 * Seguridad: rate limit estricto (política "canje") + sesión + CAPTCHA matemático + telemetría anti-bot + bloqueo temporal
 * si acumula códigos inexistentes (frena adivinar códigos) + canje atómico en transacción.
 */
import { NextRequest } from "next/server";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok, ALL } from "@/lib/api/http";
import { guard } from "@/lib/antibot/guard";
import { requireHuman } from "@/lib/antibot/human";
import { lockedFor, recordFailure } from "@/lib/antibot/ratelimit";
import { canjeSchema } from "@/lib/validations/tickets";
import { normalizarCodigo } from "@/lib/tickets/reglas";
import { canjearTicket } from "@/lib/tickets/servicio";
import { writeLog } from "@/lib/logs/logger";

const BLOQUEO = { max: 8, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };

export async function POST(req: NextRequest) {
  try {
    await guard(req, "canje");
    const s = await requireRole(req, ALL);
    const { captchaToken, captchaAnswer, antibot, codigo } = await parse(req, canjeSchema);
    const llave = `canje:${s.uid}`, espera = lockedFor(llave);
    if (espera > 0) throw new HttpError(429, "Demasiados códigos incorrectos. Inténtalo más tarde.", { "Retry-After": String(espera) });
    await requireHuman(req, "math", { captchaToken, captchaAnswer, antibot },
      { accion: "canjear_ticket", datos: `código:${codigo.length}c`, actor: { uid: s.uid, name: s.name, role: s.role } });

    const code = normalizarCodigo(codigo);
    if (!code) { recordFailure(llave, BLOQUEO); throw new HttpError(400, "El código no tiene un formato válido (ejemplo: CAFE-X92A6K)."); }
    try {
      const r = await canjearTicket(code, s);
      await writeLog({ session: s, action: "TICKET_CLAIM", module: "tickets", targetType: "ticket", targetId: code, status: "success",
        description: `Ticket asociado al usuario (${r.items.length} producto(s), uso ${r.uses}/${r.maxUses})` });
      return ok({ ...r });
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 404) recordFailure(llave, BLOQUEO); // solo los códigos inexistentes cuentan como intento de adivinar
        await writeLog({ session: s, action: "TICKET_CLAIM", module: "tickets", targetType: "ticket", targetId: code, status: "denied", description: `Canje rechazado: ${e.message}` });
      }
      throw e;
    }
  } catch (e) { return errorResponse(e); }
}
/** POST /api/auth/logout — registra el cierre de sesión (manual o por inactividad) y borra las cookies de sesión. */
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireRole, errorResponse } from "@/lib/auth/server";
import { ok, ALL } from "@/lib/api/http";
import { getCtx } from "@/lib/antibot/guard";
import { recordEvent } from "@/lib/antibot/events";
import { writeLog } from "@/lib/logs/logger";

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(req, ALL);
    const b = await req.json().catch(() => ({}));
    const porInactividad = b?.motivo === "inactividad";
    await writeLog({ session: s, action: "LOGOUT", module: "auth", status: "success", description: porInactividad ? "Cierre de sesión por inactividad" : "Cierre de sesión" });
    if (porInactividad) await recordEvent({ kind: "session", verdict: "session_expired", score: 0, signals: ["sesion_cerrada_por_inactividad"], route: req.nextUrl.pathname, ctx: getCtx(req), accion: "logout_inactividad", actor: { uid: s.uid, name: s.name, role: s.role } });
    cookies().delete("sesion"); cookies().delete("actividad");
    return ok();
  } catch (e) { return errorResponse(e); }
}
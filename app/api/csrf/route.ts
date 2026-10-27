/** GET /api/csrf — entrega el token CSRF de ESTA sesión (firmado, ligado a la cookie ab_sid, válido 12 h). El navegador lo envía en x-csrf-token. */
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/server";
import { guard, emitirCsrf } from "@/lib/antibot/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await guard(req, "csrf");
    return NextResponse.json({ token: emitirCsrf(ctx.sid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
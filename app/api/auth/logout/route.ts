/** POST /api/auth/logout — registra el cierre de sesión (el cliente ejecuta signOut). */
import { NextRequest } from "next/server";
import { requireRole, errorResponse } from "@/lib/auth/server";
import { ok, ALL } from "@/lib/api/http";
import { writeLog } from "@/lib/logs/logger";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(req, ALL);
    await writeLog({ session: s, action: "LOGOUT", module: "auth", status: "success", description: "Cierre de sesión" });
    cookies().delete("sesion");
    return ok();
  } catch (e) { return errorResponse(e); }
}

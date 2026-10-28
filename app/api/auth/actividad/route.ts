/** POST /api/auth/actividad — latido: mientras la persona usa la página, renueva la marca de actividad del servidor (lo hace requireRole). */
import { NextRequest } from "next/server";
import { requireRole, errorResponse } from "@/lib/auth/server";
import { ok, ALL } from "@/lib/api/http";

export async function POST(req: NextRequest) {
  try { await requireRole(req, ALL, { exigirTerminos: false }); return ok(); } catch (e) { return errorResponse(e); }
}
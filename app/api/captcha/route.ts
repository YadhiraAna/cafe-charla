/** GET /api/captcha?kind=… → nuevo reto + token de formulario firmado. Con rate limiting (política "captcha"). */
import { NextRequest, NextResponse } from "next/server";
import { createChallenge, CaptchaKind } from "@/lib/captcha/server";
import { errorResponse, HttpError } from "@/lib/auth/server";
import { guard } from "@/lib/antibot/guard";
import { issueFormToken } from "@/lib/antibot/human";

const KINDS: CaptchaKind[] = ["text", "math", "images", "question", "select"];
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ctx = await guard(req, "captcha");
    const kind = req.nextUrl.searchParams.get("kind") as CaptchaKind;
    if (!KINDS.includes(kind)) throw new HttpError(400, "Tipo de CAPTCHA inválido.");
    return NextResponse.json({ ...createChallenge(kind), formToken: issueFormToken(ctx.sid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
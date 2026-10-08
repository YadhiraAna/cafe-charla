/**
 * POST /api/antibot/fingerprint — baliza que cada navegador envía una vez por pestaña.
 * Combina fingerprint (navigator.webdriver…) y cabeceras (User-Agent…). Solo detecta y audita: no bloquea la navegación.
 * No devuelve el veredicto al cliente (para no darle información al bot). El extractor autorizado se registra aparte.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/auth/server";
import { guard } from "@/lib/antibot/guard";
import { recordEvent } from "@/lib/antibot/events";
import { flagSession } from "@/lib/antibot/human";
import { scoreFingerprint, scoreHeaders, total, levelOf } from "@/lib/antibot/score";
import { fpSchema } from "@/lib/validations/schemas";
import { parse, ok } from "@/lib/api/http";

export async function POST(req: NextRequest) {
  try {
    const ctx = await guard(req, "beacon");
    const body = await parse(req, z.object({ fp: fpSchema, path: z.string().max(200) }));
    const signals = [...scoreHeaders({ ua: ctx.ua, acceptLanguage: req.headers.get("accept-language") ?? "" }), ...scoreFingerprint(body.fp, ctx.ua)];
    const score = total(signals), level = levelOf(score);
    if (ctx.scraper) await recordEvent({ kind: "fingerprint", verdict: "authorized_scraper", score, signals: signals.map(s => s.name), route: body.path, ctx });
    else if (level !== "human") { flagSession(ctx.sid); await recordEvent({ kind: "fingerprint", verdict: level, score, signals: signals.map(s => s.name), route: body.path, ctx }); }
    return ok();
  } catch (e) { return errorResponse(e); }
}

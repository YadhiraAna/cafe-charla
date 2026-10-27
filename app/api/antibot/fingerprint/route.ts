/**
 * POST /api/antibot/fingerprint — baliza que cada navegador envía una vez por pestaña, al cargar la página.
 * Evalúa: cabeceras, parámetros del navegador, objetos globales de automatización, Navigation Timing y huella de canvas/WebGL/fuentes.
 * Solo detecta y audita (no bloquea la navegación). No devuelve el veredicto al cliente para no darle pistas a un bot.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/auth/server";
import { guard } from "@/lib/antibot/guard";
import { recordEvent } from "@/lib/antibot/events";
import { flagSession, huellaEnMuchasSesiones } from "@/lib/antibot/human";
import { scoreEntorno, scoreFingerprint, scoreHeaders, total, levelOf } from "@/lib/antibot/score";
import { fpSchema, entornoSchema } from "@/lib/validations/schemas";
import { parse, ok } from "@/lib/api/http";

export async function POST(req: NextRequest) {
  try {
    const ctx = await guard(req, "beacon");
    const body = await parse(req, z.object({ fp: fpSchema, entorno: entornoSchema.optional(), path: z.string().max(200) }));
    const signals = [...scoreHeaders({ ua: ctx.ua, acceptLanguage: req.headers.get("accept-language") ?? "" }),
      ...scoreFingerprint(body.fp, ctx.ua), ...scoreEntorno(body.entorno, body.fp.touch, ctx.ua)];
    if (body.entorno && huellaEnMuchasSesiones(body.entorno.huella.hash, ctx.sid)) signals.push({ name: "huella_en_muchas_sesiones", weight: 15 });
    const score = total(signals), level = levelOf(score);
    const base = { kind: "fingerprint" as const, score, signals: signals.map(s => s.name), route: body.path, ctx, accion: "carga_de_pagina",
      evaluadas: ["cabeceras", "parametros", "webdriver", "globals", "timing", "huella"], huella: body.entorno?.huella.hash.slice(0, 14) };
    if (ctx.scraper) await recordEvent({ ...base, verdict: "authorized_scraper" });
    else if (level !== "human") { flagSession(ctx.sid); await recordEvent({ ...base, verdict: level }); }
    return ok();
  } catch (e) { return errorResponse(e); }
}
/**
 * POST /api/admin/scraping — recibe resultados del extractor Selenium (selenium/extractor.py).
 * Autenticación: cabecera x-scraper-key = SCRAPER_API_KEY (secreto solo de servidor).
 *   { phase: "start" }                → log "Inicio de extracción"
 *   { phase: "finish", result: {...} } → guarda scraping_results + logs de éxito/fallo y finalización
 */
import crypto from "crypto";
import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok } from "@/lib/api/http";
import { writeLog } from "@/lib/logs/logger";
import { guard } from "@/lib/antibot/guard";

const int = z.number().int().min(0).max(1_000_000);
const result = z.object({
  executedAt: z.string().datetime(), status: z.enum(["success", "error"]),
  pagesVisited: int, productsFound: int, promotionsFound: int, postsFound: int, commentsFound: int, reviewsFound: int, imagesFound: int, linksFound: int,
  duration: z.number().min(0).max(86400), outputFile: z.string().max(200),
  details: z.record(z.unknown()).refine(d => JSON.stringify(d).length <= 300_000, "details demasiado grande"),
});
const schema = z.discriminatedUnion("phase", [z.object({ phase: z.literal("start") }), z.object({ phase: z.literal("finish"), result })]);

const SYSTEM = { userName: "Selenium", userId: "system:selenium", userRole: "system", action: "SCRAPING", module: "selenium", targetType: "scraping" } as const;

async function checkKey(req: NextRequest) {
  const expected = process.env.SCRAPER_API_KEY;
  if (!expected || expected.length < 16) throw new HttpError(503, "La ingesta de Selenium no está configurada (SCRAPER_API_KEY).");
  const h = (s: string) => crypto.createHash("sha256").update(s).digest();
  if (!crypto.timingSafeEqual(h(req.headers.get("x-scraper-key") ?? ""), h(expected))) {
    await writeLog({ ...SYSTEM, status: "denied", description: "Intento de ingesta con clave inválida" });
    throw new HttpError(401, "Clave inválida.");
  }
}

export async function POST(req: NextRequest) {
  try {
    await guard(req, "auth");
    await checkKey(req);
    const body = await parse(req, schema);
    if (body.phase === "start") {
      await writeLog({ ...SYSTEM, status: "success", description: "Inicio de extracción" });
      return ok();
    }
    const r = body.result;
    const ref = await adminDb.collection("scraping_results").add({ ...r, executedAt: Timestamp.fromDate(new Date(r.executedAt)) });
    await writeLog({ ...SYSTEM, targetId: ref.id, status: r.status, description: r.status === "success"
      ? `Extracción exitosa: ${r.pagesVisited} páginas, ${r.productsFound} productos, ${r.postsFound} publicaciones`
      : `Extracción fallida o incompleta: ${r.pagesVisited} páginas visitadas` });
    await writeLog({ ...SYSTEM, targetId: ref.id, status: "success", description: `Finalización de extracción (${r.duration} s)` });
    return ok({ id: ref.id });
  } catch (e) { return errorResponse(e); }
}

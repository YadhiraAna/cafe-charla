/** Utilidades comunes de las rutas API. */
import "server-only";
import { NextResponse } from "next/server";
import { z, ZodTypeAny } from "zod";
import { HttpError, Role } from "@/lib/auth/server";
import { verifyCaptcha, CaptchaKind } from "@/lib/captcha/server";

export const ALL: Role[] = ["user", "moderator", "admin"];
export const MOD: Role[] = ["moderator", "admin"];

/** Lee y valida el JSON del cuerpo; lanza 400 con el primer mensaje de error. */
export async function parse<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try { body = await req.json(); } catch { throw new HttpError(400, "Cuerpo de la petición inválido."); }
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? "Datos inválidos.");
  return r.data;
}

/** Valida el CAPTCHA en el servidor; si falla, la operación se detiene. */
export function requireCaptcha(kind: CaptchaKind, b: { captchaToken: string; captchaAnswer: string }) {
  const v = verifyCaptcha(b.captchaToken, kind, b.captchaAnswer);
  if (!v.ok) throw new HttpError(400, v.reason ?? "CAPTCHA incorrecto.");
}

export const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });

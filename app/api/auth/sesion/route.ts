/**
 * POST   /api/auth/sesion — cambia el ID token (Bearer) por una COOKIE de sesión httpOnly, revocable y de 5 días.
 * DELETE /api/auth/sesion — la borra. La cookie no es legible desde JavaScript (protege contra XSS); las peticiones que
 * cambian datos siguen protegidas contra CSRF por SameSite=Lax + comprobación de Origin + token de formulario.
 */
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { errorResponse, HttpError } from "@/lib/auth/server";
import { ok } from "@/lib/api/http";
import { guard } from "@/lib/antibot/guard";

const DIAS = 5;

export async function POST(req: NextRequest) {
  try {
    await guard(req, "write");
    const h = req.headers.get("authorization") ?? "";
    if (!h.startsWith("Bearer ")) throw new HttpError(401, "Debes iniciar sesión.");
    const idToken = h.slice(7);
    await adminAuth.verifyIdToken(idToken, true); // firma y revocación
    const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: DIAS * 24 * 3600 * 1000 });
    cookies().set("sesion", cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DIAS * 24 * 3600 });
    return ok();
  } catch (e) { return errorResponse(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    await guard(req, "write");
    cookies().delete("sesion");
    return ok();
  } catch (e) { return errorResponse(e); }
}
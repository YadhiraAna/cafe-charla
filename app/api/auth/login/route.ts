/**
 * POST /api/auth/login — rate limit + verificación humana (CAPTCHA matemático) en el servidor, y bloqueo temporal
 * tras 8 fallos (por IP y por correo). Devuelve un customToken; el cliente completa con signInWithCustomToken.
 */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok } from "@/lib/api/http";
import { guard } from "@/lib/antibot/guard";
import { requireHuman } from "@/lib/antibot/human";
import { recordEvent } from "@/lib/antibot/events";
import { lockedFor, recordFailure, clearFailures } from "@/lib/antibot/ratelimit";
import { LOGIN_LOCK } from "@/lib/antibot/config";
import { loginSchema } from "@/lib/validations/schemas";
import { writeLog } from "@/lib/logs/logger";

export async function POST(req: NextRequest) {
  try {
    const ctx = await guard(req, "auth");
    const b = await parse(req, loginSchema);
    await requireHuman(req, "math", b);

    const ipKey = `ip:${ctx.ip}`, mailKey = `mail:${b.email}`, route = req.nextUrl.pathname;
    const wait = Math.max(lockedFor(ipKey), lockedFor(mailKey));
    if (wait > 0) {
      await recordEvent({ kind: "bruteforce", verdict: "locked", score: 0, signals: ["bloqueo_temporal_activo"], route, ctx });
      throw new HttpError(429, "Demasiados intentos fallidos. Inténtalo más tarde.", { "Retry-After": String(wait) });
    }
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: b.email, password: b.password, returnSecureToken: false }),
    });
    const data = await res.json();
    const fail = async () => {
      await writeLog({ userName: b.email, action: "LOGIN", module: "auth", status: "error", description: "Login fallido" });
      const a = recordFailure(ipKey, LOGIN_LOCK), c = recordFailure(mailKey, LOGIN_LOCK);
      if (a || c) await recordEvent({ kind: "bruteforce", verdict: "locked", score: 0, signals: ["umbral_de_fallos_alcanzado"], route, ctx });
      throw new HttpError(401, "Correo o contraseña incorrectos.");
    };
    if (!res.ok || !data.localId) return await fail();

    const ref = adminDb.doc(`users/${data.localId}`), user = (await ref.get()).data();
    if (!user || user.status !== "active") {
      await writeLog({ userName: b.email, action: "LOGIN", module: "auth", status: "denied", description: "Login bloqueado: cuenta inactiva" });
      throw new HttpError(403, "Tu cuenta está desactivada.");
    }
    clearFailures(mailKey);
    await ref.update({ lastLoginAt: FieldValue.serverTimestamp() });
    await writeLog({ session: { uid: user.uid, name: user.name, role: user.role }, action: "LOGIN", module: "auth", status: "success", description: "Login exitoso" });
    return ok({ customToken: await adminAuth.createCustomToken(user.uid), role: user.role });
  } catch (e) { return errorResponse(e); }
}

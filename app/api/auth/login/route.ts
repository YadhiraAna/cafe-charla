/**
 * POST /api/auth/login — CSRF + rate limit + verificación humana (CAPTCHA matemático) y BLOQUEO REAL: TODO intento fallido cuenta
 * (CAPTCHA incorrecto, bloqueo anti-bot, contraseña errónea). Al llegar al límite la cuenta/IP queda bloqueada 15 min y el bloqueo se duplica si reincide.
 * La cuenta se crea en `users` SOLO cuando el correo ya fue verificado (aquí, en el primer inicio de sesión).
 * Tras entrar vincula automáticamente los tickets que el cajero creó para ese correo.
 */
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { errorResponse, HttpError } from "@/lib/auth/server";
import { parse, ok } from "@/lib/api/http";
import { guard } from "@/lib/antibot/guard";
import { requireHuman } from "@/lib/antibot/human";
import { recordEvent, enmascararCorreo } from "@/lib/antibot/events";
import { lockedFor, recordFailure, clearFailures } from "@/lib/antibot/ratelimit";
import { LOGIN_LOCK, LOGIN_LOCK_IP } from "@/lib/antibot/config";
import { loginSchema } from "@/lib/validations/schemas";
import { vincularPendientes } from "@/lib/tickets/servicio";
import { writeLog } from "@/lib/logs/logger";

const tiempo = (s: number) => (s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`);
const VERIFICAR = "Debes verificar tu correo antes de iniciar sesión. Revisa tu bandeja (y spam) o solicita un nuevo enlace.";

export async function POST(req: NextRequest) {
  try {
    const ctx = await guard(req, "auth");
    const b = await parse(req, loginSchema);
    const ipKey = `ip:${ctx.ip}`, mailKey = `mail:${b.email}`, route = req.nextUrl.pathname, actor = { name: enmascararCorreo(b.email), role: "visitante" };

    const espera = Math.max(lockedFor(ipKey), lockedFor(mailKey));
    if (espera > 0) {
      await recordEvent({ kind: "bruteforce", verdict: "locked", score: 0, signals: ["bloqueo_temporal_activo"], route, ctx, accion: "login", actor });
      throw new HttpError(429, `Demasiados intentos fallidos. Tu acceso está bloqueado: inténtalo de nuevo en ${tiempo(espera)}.`, { "Retry-After": String(espera) });
    }
    /** Cuenta un intento fallido; si alcanza el límite, bloquea de verdad y responde con el tiempo restante. */
    const fallo = async () => {
      const c = recordFailure(mailKey, LOGIN_LOCK), a = recordFailure(ipKey, LOGIN_LOCK_IP);
      if (!c && !a) return;
      await recordEvent({ kind: "bruteforce", verdict: "locked", score: 0, signals: ["umbral_de_fallos_alcanzado"], route, ctx, accion: "login", actor });
      const seg = Math.max(lockedFor(ipKey), lockedFor(mailKey));
      throw new HttpError(429, `Demasiados intentos fallidos. Tu acceso quedó bloqueado: inténtalo de nuevo en ${tiempo(seg)}.`, { "Retry-After": String(seg) });
    };

    try { await requireHuman(req, "math", b, { accion: "login", datos: "credenciales enviadas", actor }); }
    catch (e) { if (e instanceof HttpError) await fallo(); throw e; }

    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: b.email, password: b.password, returnSecureToken: false }),
    });
    const data = await res.json();
    if (!res.ok || !data.localId) {
      await writeLog({ userName: b.email, action: "LOGIN", module: "auth", status: "error", description: "Login fallido" });
      await fallo();
      throw new HttpError(401, "Correo o contraseña incorrectos.");
    }

    const uid: string = data.localId, ref = adminDb.doc(`users/${uid}`);
    let user = (await ref.get()).data();
    if (!user) {
      // Registro nuevo: la cuenta se crea en la base de datos SOLO si el correo ya fue verificado.
      const pend = await adminDb.doc(`registros_pendientes/${uid}`).get();
      if (!pend.exists) throw new HttpError(403, "Tu cuenta está desactivada.");
      if (!(await adminAuth.getUser(uid)).emailVerified) throw new HttpError(403, VERIFICAR);
      const p = pend.data()!;
      user = { uid, name: p.name, email: p.email, role: "user", photoURL: "", photoPublicId: "", status: "active", terminosVersion: p.terminosVersion, terminosAceptadasEn: p.terminosAceptadasEn,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastLoginAt: null };
      await ref.set(user);
      await pend.ref.delete();
      await writeLog({ session: { uid, name: p.name, role: "user" }, action: "REGISTER", module: "auth", targetType: "user", targetId: uid, status: "success", description: "Cuenta activada: correo verificado" });
    }
    if (user.status !== "active") {
      await writeLog({ userName: b.email, action: "LOGIN", module: "auth", status: "denied", description: "Login bloqueado: cuenta inactiva" });
      throw new HttpError(403, "Tu cuenta está desactivada.");
    }
    if (user.requiereVerificacion === true && !(await adminAuth.getUser(uid)).emailVerified) { // cuentas creadas con la versión anterior
      await writeLog({ userName: b.email, action: "LOGIN", module: "auth", status: "denied", description: "Login bloqueado: correo sin verificar" });
      throw new HttpError(403, VERIFICAR);
    }

    clearFailures(mailKey);
    await ref.update({ lastLoginAt: FieldValue.serverTimestamp() });
    let vinculados = 0;
    try { vinculados = await vincularPendientes({ uid, name: user.name, email: user.email, role: user.role }); } catch (e) { console.error("[login] vincular tickets", e); }
    await writeLog({ session: { uid, name: user.name, role: user.role }, action: "LOGIN", module: "auth", status: "success", description: `Login exitoso${vinculados ? ` (${vinculados} ticket(s) vinculados automáticamente)` : ""}` });
    return ok({ customToken: await adminAuth.createCustomToken(uid), role: user.role, ticketsVinculados: vinculados });
  } catch (e) { return errorResponse(e); }
}
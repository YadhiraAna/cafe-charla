/** Validación de correos: que el dominio EXISTA y reciba correo (MX) y envío del correo de verificación de Firebase (gratis). */
import "server-only";
import { promises as dns } from "dns";

const SIN_REGISTRO = ["ENODATA", "ENOTFOUND"];
const conTiempo = <T,>(p: Promise<T>, ms = 4000) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), ms))]);

async function consultar(dominio: string): Promise<"si" | "no" | "desconocido"> {
  try { if ((await conTiempo(dns.resolveMx(dominio))).length) return "si"; }
  catch (e: any) { if (!SIN_REGISTRO.includes(e.code)) return "desconocido"; }
  try { return (await conTiempo(dns.resolve4(dominio))).length ? "si" : "no"; }
  catch (e: any) { return SIN_REGISTRO.includes(e.code) ? "no" : "desconocido"; }
}
/** Control: si ni siquiera un dominio conocido se resuelve, el DNS del servidor no funciona y no se debe acusar al usuario. */
const hayDns = () => conTiempo(dns.resolveMx("gmail.com")).then(r => r.length > 0).catch(() => false);

/** "si" = el dominio recibe correo · "no" = no existe o formato inválido · "desconocido" = DNS/red no disponible (nunca se bloquea por eso). */
export async function dominioRecibeCorreo(correo: string): Promise<"si" | "no" | "desconocido"> {
  const dominio = correo.split("@")[1]?.toLowerCase();
  if (!dominio || !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(dominio)) return "no";
  const v = await consultar(dominio);
  return v === "no" && !(await hayDns()) ? "desconocido" : v;
}

const REST = "https://identitytoolkit.googleapis.com/v1/accounts";
/** Pide a Firebase que envíe el correo de verificación. Solo funciona con credenciales correctas. */
export async function enviarCorreoVerificacion(email: string, password: string): Promise<"enviado" | "credenciales" | "error"> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY, cab = { "Content-Type": "application/json" };
  try {
    const s = await fetch(`${REST}:signInWithPassword?key=${key}`, { method: "POST", headers: cab, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    const d = await s.json();
    if (!s.ok || !d.idToken) return "credenciales";
    const r = await fetch(`${REST}:sendOobCode?key=${key}`, { method: "POST", headers: cab, body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: d.idToken }) });
    return r.ok ? "enviado" : "error";
  } catch { return "error"; }
}
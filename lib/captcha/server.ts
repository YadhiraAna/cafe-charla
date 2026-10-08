/**
 * CAPTCHAs propios con validación server-side (5 tipos).
 * Reto sin estado: token = base64url(payload).firma-HMAC. La respuesta correcta
 * viaja solo como hash dentro del payload. Expira (5 min), se usa una vez y
 * permite máx. 3 intentos. Contadores en memoria: válido para ejecución local
 * de una sola instancia (en producción usar Firestore/Redis).
 */
import "server-only";
import crypto from "crypto";

export type CaptchaKind = "text" | "math" | "images" | "question" | "select";
export interface PublicChallenge { token: string; kind: CaptchaKind; prompt: string; options?: string[]; code?: string }

const TTL_MS = 5 * 60 * 1000, MAX_ATTEMPTS = 3;
const attempts = new Map<string, number>(), used = new Set<string>();

const secret = () => { const s = process.env.CAPTCHA_SECRET; if (!s) throw new Error("Falta CAPTCHA_SECRET"); return s; };
const hmac = (s: string) => crypto.createHmac("sha256", secret()).update(s).digest("base64url");
const norm = (a: string) => a.trim().toLowerCase();
const hashAnswer = (id: string, a: string) => hmac(`${id}:${norm(a)}`);
const pick = <T,>(arr: T[]) => arr[crypto.randomInt(arr.length)];
const shuffle = <T,>(arr: T[]) => [...arr].sort(() => crypto.randomInt(3) - 1);

const QUESTIONS = [
  { q: "¿Qué bebida se prepara normalmente con café y leche?", a: ["latte", "café con leche", "cafe con leche", "capuchino", "cappuccino"] },
  { q: "¿De qué planta provienen los granos de café?", a: ["cafeto", "planta de café", "planta de cafe"] },
  { q: "¿Cómo se llama el café sin leche, corto e intenso?", a: ["espresso", "expreso"] },
];

export function createChallenge(kind: CaptchaKind): PublicChallenge {
  const id = crypto.randomUUID();
  let prompt = "", answers: string[] = [], options: string[] | undefined, code: string | undefined;

  if (kind === "text") {
    code = Array.from({ length: 6 }, () => pick([..."ABCDEFGHJKLMNPQRSTUVWXYZ23456789"])).join("");
    prompt = "Escribe los caracteres de la imagen."; answers = [code];
  } else if (kind === "math") {
    const a = crypto.randomInt(2, 15), b = crypto.randomInt(2, 15);
    prompt = `${a} + ${b} = ?`; answers = [String(a + b)];
  } else if (kind === "images") {
    options = shuffle(["☕", "☕", "☕", "🍕", "🚗", "🌳", "📱", "🎸", "🍎"]);
    prompt = "Selecciona todas las imágenes que contienen una taza de café.";
    answers = [options.map((o, i) => (o === "☕" ? i : -1)).filter(i => i >= 0).join(",")];
  } else if (kind === "question") {
    const q = pick(QUESTIONS); prompt = q.q; answers = q.a;
  } else {
    const opts = ["Café", "Té", "Postre", "Otra bebida"], target = pick(opts);
    options = opts; prompt = `¿Qué consumiste? Para confirmar que eres una persona, elige "${target}".`; answers = [target];
  }

  const payload = Buffer.from(JSON.stringify({ id, kind, exp: Date.now() + TTL_MS, h: answers.map(a => hashAnswer(id, a)) })).toString("base64url");
  return { token: `${payload}.${hmac(payload)}`, kind, prompt, options, code };
}

/** Valida respuesta. Para "images" la respuesta es "0,3,5" (índices ordenados). */
export function verifyCaptcha(token: string, kind: CaptchaKind, answer: string): { ok: boolean; reason?: string } {
  const [payload, sig] = (token ?? "").split(".");
  if (!payload || !sig) return { ok: false, reason: "CAPTCHA inválido." };
  const expected = Buffer.from(hmac(payload)), got = Buffer.from(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return { ok: false, reason: "CAPTCHA inválido." };

  let p: { id: string; kind: CaptchaKind; exp: number; h: string[] };
  try { p = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return { ok: false, reason: "CAPTCHA inválido." }; }
  if (p.kind !== kind) return { ok: false, reason: "CAPTCHA de tipo incorrecto." };
  if (Date.now() > p.exp || used.has(p.id)) return { ok: false, reason: "El CAPTCHA expiró. Genera uno nuevo." };

  if (p.h.includes(hashAnswer(p.id, String(answer ?? "")))) { used.add(p.id); attempts.delete(p.id); return { ok: true }; }
  const n = (attempts.get(p.id) ?? 0) + 1; attempts.set(p.id, n);
  if (n >= MAX_ATTEMPTS) { used.add(p.id); return { ok: false, reason: "Demasiados intentos. Genera un CAPTCHA nuevo." }; }
  return { ok: false, reason: "Respuesta incorrecta." };
}

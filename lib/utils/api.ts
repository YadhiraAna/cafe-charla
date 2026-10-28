/** Cliente de las rutas /api: adjunta el ID token y el token CSRF, normaliza errores y avisa cuando se pierde la sesión. */
import { auth } from "@/lib/firebase/client";

/** Error de la API con el código HTTP y los segundos de espera (Retry-After) cuando hay bloqueo o límite. */
export class ErrorApi extends Error {
  constructor(mensaje: string, public status: number, public retryAfter = 0) { super(mensaje); }
}

let csrf: { token: string; hasta: number } | null = null;
/** Token CSRF de la sesión: se pide una vez y se reutiliza 10 min. Toda petición que cambia datos lo envía en x-csrf-token. */
async function tokenCsrf(renovar = false): Promise<string> {
  if (!renovar && csrf && csrf.hasta > Date.now()) return csrf.token;
  const r = await fetch("/api/csrf", { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) throw new ErrorApi(d.error ?? "No se pudo iniciar la protección de la sesión. Recarga la página.", r.status, Number(r.headers.get("retry-after")) || 0);
  csrf = { token: d.token, hasta: Date.now() + 10 * 60_000 };
  return d.token;
}
/** Pide el token CSRF con anticipación (al abrir la página) para que la primera acción no tenga que esperarlo. */
export const precalentarCsrf = () => { tokenCsrf().catch(() => {}); };

export async function apiFetch<T = any>(path: string, opts: { method?: string; body?: unknown; anon?: boolean } = {}, reintento = false): Promise<T> {
  const metodo = opts.method ?? "GET", headers: Record<string, string> = {};
  if (!opts.anon) { const t = await auth.currentUser?.getIdToken(); if (t) headers.Authorization = `Bearer ${t}`; }
  if (metodo !== "GET") headers["x-csrf-token"] = await tokenCsrf();
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  const res = await fetch(path, { method: metodo, headers, body });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && /CSRF/.test(String(data.error)) && !reintento) { await tokenCsrf(true); return apiFetch<T>(path, opts, true); } // el token pudo caducar: se renueva una vez
  if (res.status === 401 && typeof window !== "undefined" && !opts.anon) window.dispatchEvent(new CustomEvent("sesion-expirada", { detail: data.error }));
  if (!res.ok) throw new ErrorApi(data.error ?? "Ocurrió un error. Inténtalo de nuevo.", res.status, Number(res.headers.get("retry-after")) || 0);
  return data as T;
}
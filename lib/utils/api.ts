/** Cliente de las rutas /api: adjunta el ID token de Firebase y normaliza errores. */
import { auth } from "@/lib/firebase/client";

export async function apiFetch<T = any>(path: string, opts: { method?: string; body?: unknown; anon?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!opts.anon) { const t = await auth.currentUser?.getIdToken(); if (t) headers.Authorization = `Bearer ${t}`; }
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  const res = await fetch(path, { method: opts.method ?? "GET", headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Ocurrió un error. Inténtalo de nuevo.");
  return data as T;
}

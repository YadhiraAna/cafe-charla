"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import Captcha, { CaptchaValue } from "@/components/captcha/Captcha";
import { Field, PageHead, Status } from "@/components/ui";

const HOME: Record<string, string> = { admin: "/admin", moderator: "/admin/moderacion", waiter: "/cajero", user: "/perfil" };
const MOTIVOS: Record<string, string> = { inactividad: "Tu sesión se cerró por inactividad. Inicia sesión de nuevo.", expirada: "Tu sesión expiró. Inicia sesión de nuevo." };
const fmt = (s: number) => (s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`);

function LoginForm() {
  const router = useRouter(), params = useSearchParams(), a = useAction();
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [cap, setCap] = useState<CaptchaValue | null>(null), [reset, setReset] = useState(0);
  const [hasta, setHasta] = useState(0), [ahora, setAhora] = useState(Date.now());
  const next = params.get("next"), motivo = MOTIVOS[params.get("motivo") ?? ""];

  // Cuenta atrás del bloqueo: el botón queda desactivado de verdad hasta que termine
  useEffect(() => {
    if (hasta <= Date.now()) return;
    const t = setInterval(() => { setAhora(Date.now()); if (Date.now() >= hasta) clearInterval(t); }, 1000);
    return () => clearInterval(t);
  }, [hasta]);
  const resta = Math.max(0, Math.ceil((hasta - ahora) / 1000)), bloqueado = resta > 0;

  return (
    <form className="mx-auto max-w-md space-y-4" onSubmit={e => { e.preventDefault(); a.run(async () => {
      if (bloqueado) throw new Error(`Acceso bloqueado temporalmente. Podrás intentar de nuevo en ${fmt(resta)}.`);
      if (!cap) throw new Error("Resuelve la verificación para continuar.");
      try {
        const r = await apiFetch<{ customToken: string; role: string }>("/api/auth/login", { method: "POST", anon: true, body: { email, password, ...cap } });
        await signInWithCustomToken(auth, r.customToken);
        await apiFetch("/api/auth/sesion", { method: "POST" }).catch(() => {}); // cookie httpOnly de sesión (opcional)
        router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : HOME[r.role] ?? "/");
      } catch (err: any) {
        setReset(n => n + 1);
        if (err?.retryAfter > 0) { setHasta(Date.now() + err.retryAfter * 1000); setAhora(Date.now()); }
        throw err;
      }
    }); }}>
      <PageHead title="Iniciar sesión" />
      {motivo && <Status done={motivo} />}
      <Field label="Correo electrónico" id="email"><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
      <Field label="Contraseña" id="password"><input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
      <Captcha kind="math" onChange={setCap} resetKey={reset} />
      <Status error={a.error} done={a.done} />
      {bloqueado && <p role="timer" className="rounded-md border border-rojo/40 bg-rojo/10 px-3 py-2 text-sm text-rojo">Acceso bloqueado. Tiempo restante: <strong>{fmt(resta)}</strong>.</p>}
      {a.error.includes("verificar tu correo") && (
        <button type="button" className="text-sm underline" onClick={() => a.run(async () => {
          await apiFetch("/api/auth/reenviar", { method: "POST", anon: true, body: { email, password } });
          return "Si los datos son correctos, te enviamos un nuevo enlace de verificación.";
        })}>Reenviar correo de verificación</button>
      )}
      <button className="btn-primary w-full" disabled={a.busy || bloqueado}>{bloqueado ? `Bloqueado · ${fmt(resta)}` : a.busy ? "Entrando…" : "Iniciar sesión"}</button>
      <p className="text-sm"><Link href="/recuperar-password" className="underline">¿Olvidaste tu contraseña?</Link> · <Link href="/registro" className="underline">Crear cuenta</Link></p>
    </form>
  );
}
export default function LoginPage() { return <Suspense><LoginForm /></Suspense>; }
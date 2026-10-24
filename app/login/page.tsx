"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import Captcha, { CaptchaValue } from "@/components/captcha/Captcha";
import { Field, PageHead, Status } from "@/components/ui";

const HOME: Record<string, string> = { admin: "/admin", moderator: "/admin/moderacion", waiter: "/mesero", user: "/perfil" };

function LoginForm() {
  const router = useRouter(), params = useSearchParams(), a = useAction();
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [cap, setCap] = useState<CaptchaValue | null>(null), [reset, setReset] = useState(0);
  const next = params.get("next");

  return (
    <form className="mx-auto max-w-md space-y-4" onSubmit={e => { e.preventDefault(); a.run(async () => {
      if (!cap) throw new Error("Resuelve la verificación para continuar.");
      try {
        const r = await apiFetch<{ customToken: string; role: string }>("/api/auth/login", { method: "POST", anon: true, body: { email, password, ...cap } });
        await signInWithCustomToken(auth, r.customToken);
        await apiFetch("/api/auth/sesion", { method: "POST" }).catch(() => {}); // cookie httpOnly de sesión (opcional)
        router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : HOME[r.role] ?? "/");
      } catch (err) { setReset(n => n + 1); throw err; }
    }); }}>
      <PageHead title="Iniciar sesión" />
      <Field label="Correo electrónico" id="email"><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
      <Field label="Contraseña" id="password"><input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
      <Captcha kind="math" onChange={setCap} resetKey={reset} />
      <Status error={a.error} done={a.done} />
      {a.error.includes("verificar tu correo") && (
        <button type="button" className="text-sm underline" onClick={() => a.run(async () => {
          await apiFetch("/api/auth/reenviar", { method: "POST", anon: true, body: { email, password } });
          return "Si los datos son correctos, te enviamos un nuevo enlace de verificación.";
        })}>Reenviar correo de verificación</button>
      )}
      <button className="btn-primary w-full" disabled={a.busy}>{a.busy ? "Entrando…" : "Iniciar sesión"}</button>
      <p className="text-sm"><Link href="/recuperar-password" className="underline">¿Olvidaste tu contraseña?</Link> · <Link href="/registro" className="underline">Crear cuenta</Link></p>
    </form>
  );
}
export default function LoginPage() { return <Suspense><LoginForm /></Suspense>; }
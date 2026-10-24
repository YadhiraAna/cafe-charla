"use client";
import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import Captcha, { CaptchaValue } from "@/components/captcha/Captcha";
import { Field, PageHead, Status } from "@/components/ui";

export default function RegisterPage() {
  const a = useAction(), [f, setF] = useState({ name: "", email: "", password: "", confirmPassword: "" }), [terms, setTerms] = useState(false);
  const [cap, setCap] = useState<CaptchaValue | null>(null), [reset, setReset] = useState(0), [created, setCreated] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (created) return <div className="mx-auto max-w-md space-y-4 text-center"><PageHead title="¡Cuenta creada!" /><p>Te enviamos un correo para verificar tu dirección. Ábrelo y confirma el enlace (revisa también spam); después podrás iniciar sesión.</p><Link href="/login" className="btn-primary">Iniciar sesión</Link></div>;
  return (
    <form className="mx-auto max-w-md space-y-4" onSubmit={e => { e.preventDefault(); a.run(async () => {
      if (!cap) throw new Error("Resuelve la verificación para continuar.");
      try { await apiFetch("/api/auth/register", { method: "POST", anon: true, body: { ...f, terms, ...cap } }); setCreated(true); }
      catch (err) { setReset(n => n + 1); throw err; }
    }); }}>
      <PageHead title="Crear cuenta" />
      <Field label="Nombre" id="name"><input id="name" className="input" autoComplete="name" required minLength={2} maxLength={60} value={f.name} onChange={set("name")} /></Field>
      <Field label="Correo electrónico" id="email"><input id="email" className="input" type="email" autoComplete="email" required value={f.email} onChange={set("email")} /></Field>
      <Field label="Contraseña" id="password" hint="Mínimo 8 caracteres, con al menos una letra y un número."><input id="password" className="input" type="password" autoComplete="new-password" required minLength={8} value={f.password} onChange={set("password")} /></Field>
      <Field label="Confirmar contraseña" id="confirm"><input id="confirm" className="input" type="password" autoComplete="new-password" required value={f.confirmPassword} onChange={set("confirmPassword")} /></Field>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" required checked={terms} onChange={e => setTerms(e.target.checked)} />Acepto los términos y las reglas de convivencia del foro.</label>
      <Captcha kind="text" onChange={setCap} resetKey={reset} />
      <Status error={a.error} />
      <button className="btn-primary w-full" disabled={a.busy}>{a.busy ? "Creando cuenta…" : "Crear cuenta"}</button>
      <p className="text-sm">¿Ya tienes cuenta? <Link href="/login" className="underline">Inicia sesión</Link></p>
    </form>
  );
}

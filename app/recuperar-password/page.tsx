"use client";
import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import { Field, PageHead, Status } from "@/components/ui";

export default function RecoverPage() {
  const a = useAction(), [email, setEmail] = useState("");
  return (
    <form className="mx-auto max-w-md space-y-4" onSubmit={e => { e.preventDefault(); a.run(async () => (await apiFetch<{ message: string }>("/api/auth/reset", { method: "POST", anon: true, body: { email } })).message); }}>
      <PageHead title="Recuperar contraseña" lead="Te enviaremos un enlace para crear una nueva." />
      <Field label="Correo electrónico" id="email"><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
      <Status error={a.error} done={a.done} />
      <button className="btn-primary w-full" disabled={a.busy}>{a.busy ? "Enviando…" : "Enviar enlace"}</button>
      <p className="text-sm"><Link href="/login" className="underline">Volver a iniciar sesión</Link></p>
    </form>
  );
}

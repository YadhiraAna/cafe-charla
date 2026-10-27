"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { useAction } from "@/hooks/useAction";
import { Status } from "@/components/ui";
import { TERMINOS_VERSION } from "@/lib/antibot/config";

/** Si la persona con sesión no ha aceptado la versión vigente de los términos, se le pide antes de seguir. */
export default function AceptarTerminos() {
  const { profile, refreshProfile, logout } = useAuth(), a = useAction(), [ok, setOk] = useState(false), boton = useRef<HTMLButtonElement>(null);
  const pendiente = !!profile && profile.status === "active" && profile.terminosVersion !== TERMINOS_VERSION;
  useEffect(() => { if (pendiente) boton.current?.focus(); }, [pendiente]);
  if (!pendiente) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-espresso/60 p-4" role="dialog" aria-modal="true" aria-labelledby="t-titulo">
      <div className="card max-w-md space-y-3">
        <h2 id="t-titulo" className="text-2xl">Términos y privacidad</h2>
        <p className="text-sm">Para seguir usando Café &amp; Charla debes aceptar la versión {TERMINOS_VERSION} de los <Link href="/terminos" target="_blank" className="underline">Términos y condiciones</Link> y del <Link href="/privacidad" target="_blank" className="underline">Aviso de privacidad y cookies</Link>.</p>
        <label className="flex min-h-[44px] items-start gap-2 text-sm"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="mt-1" />He leído y acepto ambos documentos.</label>
        <Status error={a.error} />
        <div className="flex flex-wrap gap-2">
          <button ref={boton} className="btn-primary" disabled={!ok || a.busy} onClick={() => a.run(async () => { await apiFetch("/api/users/me/terminos", { method: "POST", body: { version: TERMINOS_VERSION, acepto: true } }); await refreshProfile(); })}>{a.busy ? "Guardando…" : "Aceptar y continuar"}</button>
          <button className="btn-ghost" onClick={() => logout()}>No acepto (cerrar sesión)</button>
        </div>
      </div>
    </div>
  );
}
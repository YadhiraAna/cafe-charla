"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { useAction } from "@/hooks/useAction";
import { Status } from "@/components/ui";
import { TERMINOS_VERSION } from "@/lib/antibot/config";
import { debePedirTerminos } from "@/lib/legal/terminos";

const RESUMEN = [
  "Tu cuenta es personal: no compartas tu contraseña.",
  "Solo puedes reseñar lo que consumiste (con ticket) y participar en el foro si ya canjeaste un ticket.",
  "No se permite contenido ofensivo ni ilegal, ni el uso de bots o programas automáticos.",
  "Por seguridad cerramos tu sesión tras un tiempo sin actividad (15 min usuarios; 10 min personal).",
  "Usamos solo cookies esenciales y una huella técnica del navegador, únicamente para seguridad.",
];

/**
 * Pide aceptar la versión vigente de los términos. No aparece en /terminos ni /privacidad (para poder leerlos), tiene scroll
 * (los botones siempre se alcanzan) y solo se sale aceptando o cerrando sesión.
 */
export default function AceptarTerminos() {
  const { profile, refreshProfile, logout } = useAuth(), ruta = usePathname(), a = useAction(), [ok, setOk] = useState(false), caja = useRef<HTMLInputElement>(null);
  const pendiente = debePedirTerminos(profile, ruta, TERMINOS_VERSION);
  useEffect(() => { if (pendiente) caja.current?.focus(); }, [pendiente]);
  if (!pendiente) return null;
  return (
    <div className="no-print fixed inset-0 z-50 overflow-y-auto bg-espresso/60 p-4" role="dialog" aria-modal="true" aria-labelledby="t-titulo">
      <div className="card mx-auto my-4 w-full max-w-lg space-y-3 sm:my-12">
        <h2 id="t-titulo" className="text-2xl">Términos y privacidad</h2>
        <p className="text-sm">Para seguir usando Café &amp; Charla debes aceptar la versión {TERMINOS_VERSION}. Resumen:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">{RESUMEN.map(r => <li key={r}>{r}</li>)}</ul>
        <p className="text-sm">Léelos completos (se abren en otra pestaña): <Link href="/terminos" target="_blank" className="underline">Términos y condiciones</Link> · <Link href="/privacidad" target="_blank" className="underline">Aviso de privacidad y cookies</Link>.</p>
        <label className="flex min-h-[44px] items-start gap-2 text-sm"><input ref={caja} type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="mt-1" />He leído y acepto ambos documentos.</label>
        <p className="text-xs text-espresso/70">Esta ventana no se puede cerrar sin decidir: si no aceptas, se cierra tu sesión.</p>
        <Status error={a.error} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!ok || a.busy} onClick={() => a.run(async () => { await apiFetch("/api/users/me/terminos", { method: "POST", body: { version: TERMINOS_VERSION, acepto: true } }); await refreshProfile(); })}>{a.busy ? "Guardando…" : "Aceptar y continuar"}</button>
          <button className="btn-ghost" disabled={a.busy} onClick={async () => { await logout("manual"); window.location.assign("/"); }}>No acepto (cerrar sesión)</button>
        </div>
      </div>
    </div>
  );
}
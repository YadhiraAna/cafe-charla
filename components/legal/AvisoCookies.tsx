"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const CLAVE = "aviso_cookies";
/** Aviso informativo: todas las cookies del sitio son esenciales (sesión y seguridad). Solo se recuerda que la persona ya lo leyó. */
export default function AvisoCookies() {
  const [ver, setVer] = useState(false);
  useEffect(() => { setVer(!document.cookie.split("; ").some(c => c.startsWith(`${CLAVE}=`))); }, []);
  if (!ver) return null;
  const entendido = () => { document.cookie = `${CLAVE}=1; max-age=${180 * 24 * 3600}; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`; setVer(false); };
  return (
    <div role="region" aria-label="Aviso de cookies" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-espresso/20 bg-espuma p-4 shadow-lg">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm">Usamos solo cookies <strong>esenciales</strong> (inicio de sesión y seguridad contra bots). No usamos publicidad ni rastreo de terceros. <Link href="/privacidad#cookies" className="underline">Ver detalles</Link>.</p>
        <button className="btn-primary" onClick={entendido}>Entendido</button>
      </div>
    </div>
  );
}
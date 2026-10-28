"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, precalentarCsrf } from "@/lib/utils/api";
import { collectFingerprint } from "@/lib/antibot/client";
import { recogerEntorno } from "@/lib/antibot/entorno";

/**
 * Envía la huella del navegador una vez por pestaña. Se hace con el navegador libre (no mientras carga la página) y el token CSRF
 * se pide por adelantado, así la primera acción de la persona no espera esos viajes. Falla en silencio.
 */
export default function Beacon() {
  const path = usePathname();
  useEffect(() => {
    precalentarCsrf();
    try { if (sessionStorage.getItem("ab_beacon")) return; } catch { /* sin sessionStorage */ }
    const enviar = () => {
      try { sessionStorage.setItem("ab_beacon", "1"); } catch { /* sin sessionStorage */ }
      apiFetch("/api/antibot/fingerprint", { method: "POST", anon: true, body: { fp: collectFingerprint(), entorno: recogerEntorno(window, document, navigator), path } }).catch(() => {});
    };
    const id = window.setTimeout(enviar, 1500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/utils/api";
import { collectFingerprint } from "@/lib/antibot/client";
import { recogerEntorno } from "@/lib/antibot/entorno";
/** Envía el fingerprint del navegador una vez por pestaña (navigator.webdriver, tamaños, idiomas…). Falla en silencio. */
export default function Beacon() {
  const path = usePathname();
  useEffect(() => {
    try { if (sessionStorage.getItem("ab_beacon")) return; sessionStorage.setItem("ab_beacon", "1"); } catch {}
    apiFetch("/api/antibot/fingerprint", { method: "POST", anon: true, body: { fp: collectFingerprint(), entorno: recogerEntorno(window, document, navigator), path } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

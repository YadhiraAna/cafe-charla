"use client";
/**
 * Cierra la sesión tras un periodo sin actividad (según el rol) y avisa 60 s antes. La actividad en OTRA pestaña también cuenta.
 * Mientras la persona está activa, renueva cada 5 min la marca de actividad del servidor (cookie `actividad`).
 * Durante el aviso solo cuenta pulsar "Seguir conectado": mover el ratón no basta.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/utils/api";
import { AVISO_SEG, INACTIVIDAD_MIN, LATIDO_MS } from "@/lib/antibot/config";

const CLAVE = "cc_actividad"; // marca de tiempo compartida entre pestañas (un número, sin datos personales)

export default function IdleGuard() {
  const { user, profile, logout } = useAuth();
  const [resta, setResta] = useState<number | null>(null);
  const enAviso = useRef(false), saliendo = useRef(false), ultimaMarca = useRef(Date.now()), ultimoLatido = useRef(Date.now());
  const logoutRef = useRef(logout); logoutRef.current = logout;
  const limiteMs = (INACTIVIDAD_MIN[profile?.role ?? "user"] ?? 15) * 60_000;

  const salir = useCallback(async (motivo: "inactividad" | "expirada" | "manual") => {
    if (saliendo.current) return; // evita bucles si el propio cierre de sesión también responde "expirada"
    saliendo.current = true;
    await logoutRef.current(motivo).catch(() => {});
    window.location.assign(motivo === "manual" ? "/login" : `/login?motivo=${motivo}`);
  }, []);

  const registrar = useCallback(() => {
    const ahora = Date.now();
    ultimaMarca.current = ahora; enAviso.current = false; setResta(null);
    try { localStorage.setItem(CLAVE, String(ahora)); } catch { /* almacenamiento bloqueado */ }
  }, []);
  const actividad = useCallback(() => { if (!enAviso.current && Date.now() - ultimaMarca.current > 2000) registrar(); }, [registrar]);

  useEffect(() => {
    if (!user || !profile) return;
    saliendo.current = false; registrar();
    const eventos = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    eventos.forEach(e => window.addEventListener(e, actividad, { passive: true }));
    const expirada = (e: Event) => salir(/inactividad/i.test(String((e as CustomEvent).detail)) ? "inactividad" : "expirada");
    window.addEventListener("sesion-expirada", expirada);
    const reloj = setInterval(() => {
      let ultima = ultimaMarca.current;
      try { ultima = Math.max(ultima, Number(localStorage.getItem(CLAVE)) || 0); } catch { /* sin localStorage */ }
      const inactivo = Date.now() - ultima;
      if (inactivo >= limiteMs) { salir("inactividad"); return; }
      if (inactivo >= limiteMs - AVISO_SEG * 1000) { enAviso.current = true; setResta(Math.ceil((limiteMs - inactivo) / 1000)); }
      else if (enAviso.current) { enAviso.current = false; setResta(null); } // hubo actividad en otra pestaña
      if (!enAviso.current && inactivo < LATIDO_MS && Date.now() - ultimoLatido.current >= LATIDO_MS) {
        ultimoLatido.current = Date.now();
        apiFetch("/api/auth/actividad", { method: "POST" }).catch(() => {});
      }
    }, 1000);
    return () => { eventos.forEach(e => window.removeEventListener(e, actividad)); window.removeEventListener("sesion-expirada", expirada); clearInterval(reloj); };
  }, [user, profile, limiteMs, actividad, registrar, salir]);

  if (resta === null || !user) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-espresso/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="idle-titulo" aria-describedby="idle-desc">
      <div className="card max-w-sm space-y-3 text-center">
        <h2 id="idle-titulo" className="text-2xl">¿Sigues ahí?</h2>
        <p id="idle-desc" role="timer">Por seguridad cerraremos tu sesión en <strong>{resta} s</strong> por inactividad. Lo que no hayas enviado en un formulario se perderá.</p>
        <button className="btn-primary" onClick={registrar} autoFocus>Seguir conectado</button>
        <button className="btn-ghost" onClick={() => salir("manual")}>Cerrar sesión ahora</button>
      </div>
    </div>
  );
}
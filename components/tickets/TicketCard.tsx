"use client";
/** Ticket imprimible. Al imprimir SOLO sale el ticket (no la página): se marca este elemento y el CSS global oculta todo lo demás. */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { lineaProducto } from "@/lib/tickets/reglas";

export interface TicketVista {
  code: string; consumedAtMs: number; items: { name: string; qty?: number }[]; people: number; expiresAtMs?: number; uses?: number; maxUses?: number;
  participantes?: { nombre: string; correo: string; enMs: number }[]; pendiente?: string;
}

export default function TicketCard({ t }: { t: TicketVista }) {
  const [qr, setQr] = useState(""), ref = useRef<HTMLElement>(null);
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/canjear?codigo=${encodeURIComponent(t.code)}`, { width: 240, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [t.code]);
  const f = new Date(t.consumedAtMs);
  const imprimir = () => {
    const el = ref.current; if (!el) return;
    const limpiar = () => { el.removeAttribute("data-print"); document.body.classList.remove("imprimiendo-ticket"); window.removeEventListener("afterprint", limpiar); };
    el.setAttribute("data-print", "true"); document.body.classList.add("imprimiendo-ticket");
    window.addEventListener("afterprint", limpiar); window.print();
  };
  return (
    <article ref={ref} className="card mx-auto max-w-sm space-y-2 text-center" aria-label={`Ticket ${t.code}`}>
      <h3 className="text-xl">Café &amp; Charla</h3>
      {qr ? <img src={qr} alt={`Código QR del ticket ${t.code}`} className="mx-auto h-48 w-48" /> : <p role="status" className="text-sm">Generando QR…</p>}
      <p className="font-display text-2xl tracking-widest">{t.code}</p>
      <p className="text-sm">{f.toLocaleDateString("es-MX")} · {f.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</p>
      <ul className="text-sm">{t.items.map((i, k) => <li key={k}>{lineaProducto(i)}</li>)}</ul>
      <p className="text-sm">Personas: {t.people}{t.maxUses !== undefined ? ` · Usos: ${t.uses ?? 0}/${t.maxUses}` : ""}</p>
      {(t.participantes?.length || t.pendiente) ? (
        <div className="border-t border-espresso/20 pt-2 text-left text-sm">
          <p className="font-semibold">Vinculado a:</p>
          <ul>{t.participantes?.map((p, i) => <li key={i}>{p.nombre} · {p.correo}</li>)}{t.pendiente ? <li>Reservado para {t.pendiente} (se vincula al iniciar sesión)</li> : null}</ul>
        </div>
      ) : null}
      {t.expiresAtMs ? <p className="text-xs text-espresso/70">Canjeable hasta {new Date(t.expiresAtMs).toLocaleString("es-MX")}</p> : null}
      <button type="button" className="btn-ghost no-print" onClick={imprimir}>Imprimir ticket</button>
    </article>
  );
}
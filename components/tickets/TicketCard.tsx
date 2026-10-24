"use client";
/** Ticket imprimible: código, fecha/hora, productos, personas y QR que abre /canjear con el código ya escrito. */
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface TicketVista { code: string; consumedAtMs: number; items: { name: string }[]; people: number; expiresAtMs?: number; uses?: number; maxUses?: number }

export default function TicketCard({ t }: { t: TicketVista }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/canjear?codigo=${encodeURIComponent(t.code)}`, { width: 240, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [t.code]);
  const f = new Date(t.consumedAtMs);
  return (
    <article className="card mx-auto max-w-sm space-y-2 text-center" aria-label={`Ticket ${t.code}`}>
      <h3 className="text-xl">Café &amp; Charla</h3>
      {qr ? <img src={qr} alt={`Código QR del ticket ${t.code}`} className="mx-auto h-48 w-48" /> : <p role="status" className="text-sm">Generando QR…</p>}
      <p className="font-display text-2xl tracking-widest">{t.code}</p>
      <p className="text-sm">{f.toLocaleDateString("es-MX")} · {f.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</p>
      <ul className="text-sm">{t.items.map((i, k) => <li key={k}>{i.name}</li>)}</ul>
      <p className="text-sm">Personas: {t.people}{t.maxUses !== undefined ? ` · Usos: ${t.uses ?? 0}/${t.maxUses}` : ""}</p>
      {t.expiresAtMs ? <p className="text-xs text-espresso/70">Canjeable hasta {new Date(t.expiresAtMs).toLocaleString("es-MX")}</p> : null}
      <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>Imprimir ticket</button>
    </article>
  );
}
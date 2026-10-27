"use client";
import Link from "next/link";
import { useState } from "react";
import { where } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { useDocs } from "@/hooks/useDocs";
import RequireRole from "@/components/auth/RequireRole";
import TicketCard from "@/components/tickets/TicketCard";
import { Empty, PageHead, Spinner, Status } from "@/components/ui";
import type { Claim } from "@/types";
import { lineaProducto } from "@/lib/tickets/reglas";

function Historial() {
  const { user } = useAuth(), { data, error } = useDocs<Claim>("ticket_claims", where("userId", "==", user!.uid));
  const [abierto, setAbierto] = useState("");
  const lista = [...(data ?? [])].sort((x, y) => y.consumedAt.seconds - x.consumedAt.seconds);
  return (
    <>
      <PageHead title="Mis consumos" lead="Historial de tus visitas. Cada ticket canjeado queda guardado aquí." action={<Link href="/canjear" className="btn-primary">Canjear otro ticket</Link>} />
      <Status error={error} />
      {!data && !error ? <Spinner /> : lista.length === 0 ? <Empty title="Todavía no has canjeado tickets">Pide tu ticket al Cajero y canjéalo para poder reseñar lo que consumiste.</Empty> : (
        <ul className="space-y-4">{lista.map(c => (
          <li key={c.id} className="card">
            <p className="font-display text-xl">{new Date(c.consumedAt.seconds * 1000).toLocaleDateString("es-MX", { dateStyle: "long" })} · {new Date(c.consumedAt.seconds * 1000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</p>
            <p className="text-sm text-espresso/70">Ticket {c.ticketCode} · {c.people} persona(s)</p>
            <ul className="my-2 flex flex-wrap gap-2">{c.items.map((i, k) => <li key={k} className="rounded bg-espresso/10 px-2 py-1 text-sm">{lineaProducto(i)}</li>)}</ul>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost !min-h-[36px]" aria-expanded={abierto === c.id} onClick={() => setAbierto(abierto === c.id ? "" : c.id)}>{abierto === c.id ? "Ocultar ticket" : "Ver ticket y QR"}</button>
              <Link href="/resenas" className="btn-ghost !min-h-[36px]">Reseñar</Link>
            </div>
            {abierto === c.id && <div className="mt-4"><TicketCard t={{ code: c.ticketCode, consumedAtMs: c.consumedAt.seconds * 1000, items: c.items, people: c.people }} /></div>}
          </li>))}</ul>)}
    </>
  );
}
export default function MisConsumosPage() { return <RequireRole><Historial /></RequireRole>; }
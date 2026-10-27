"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, getCountFromServer, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import RequireRole from "@/components/auth/RequireRole";
import Badge from "@/components/admin/Badge";
import { PageHead, Spinner, Status } from "@/components/ui";
import type { Log } from "@/types";

const CARDS = [["users", "Usuarios registrados", "/admin/usuarios"], ["posts", "Publicaciones", "/admin/moderacion"], ["comments", "Comentarios", "/admin/moderacion"],
  ["reviews", "Reseñas", "/admin/moderacion"], ["menu", "Productos", "/admin/menu"], ["promotions", "Promociones", "/admin/promociones"], ["tickets", "Tickets", "/admin/tickets"]] as const;
const when = (s?: { seconds: number }) => (s ? new Date(s.seconds * 1000).toLocaleString("es-MX") : "");

function Dashboard() {
  const [counts, setCounts] = useState<number[] | null>(null), [logs, setLogs] = useState<Log[] | null>(null), [error, setError] = useState("");
  useEffect(() => {
    Promise.all(CARDS.map(([c]) => getCountFromServer(collection(db, c)))).then(r => setCounts(r.map(s => s.data().count))).catch(() => setError("No se pudieron cargar las estadísticas."));
    getDocs(query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(8))).then(s => setLogs(s.docs.map(d => ({ id: d.id, ...d.data() }) as Log))).catch(() => setLogs([]));
  }, []);
  return (
    <>
      <PageHead title="Panel de administración" lead="Resumen general de la cafetería y su comunidad." />
      <Status error={error} />
      {!counts && !error ? <Spinner /> : counts && (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {CARDS.map(([, label, href], i) => <li key={label} className="card"><Link href={href} className="block"><p className="text-sm text-espresso/70">{label}</p><p className="font-display text-4xl tabular-nums">{counts[i]}</p></Link></li>)}
        </ul>
      )}
      <section aria-labelledby="h-ev" className="card mt-10"><div className="mb-3 flex items-baseline justify-between"><h2 id="h-ev" className="text-2xl">Últimos eventos</h2><Link href="/admin/logs" className="text-sm underline">Ver logs</Link></div>
        {!logs ? <Spinner /> : logs.length === 0 ? <p>Aún no hay eventos registrados.</p> : <ul className="space-y-2 text-sm">{logs.map(l => <li key={l.id} className="flex items-start justify-between gap-2 border-b border-espresso/10 pb-2"><span><strong>{l.userName}</strong> · {l.description}<br /><span className="text-espresso/60">{when(l.timestamp)}</span></span><Badge value={l.status} /></li>)}</ul>}
      </section>
    </>
  );
}
export default function AdminHome() { return <RequireRole roles={["admin"]}><Dashboard /></RequireRole>; }
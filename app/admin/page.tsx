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
  ["reviews", "Reseñas", "/admin/moderacion"], ["menu", "Productos", "/admin/menu"], ["promotions", "Promociones", "/admin/promociones"]] as const;
const when = (s?: { seconds: number }) => (s ? new Date(s.seconds * 1000).toLocaleString("es-MX") : "");

function Dashboard() {
  const [counts, setCounts] = useState<number[] | null>(null), [logs, setLogs] = useState<Log[] | null>(null), [scrape, setScrape] = useState<any | null | undefined>(undefined), [error, setError] = useState("");
  useEffect(() => {
    Promise.all(CARDS.map(([c]) => getCountFromServer(collection(db, c)))).then(r => setCounts(r.map(s => s.data().count))).catch(() => setError("No se pudieron cargar las estadísticas."));
    getDocs(query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(5))).then(s => setLogs(s.docs.map(d => ({ id: d.id, ...d.data() }) as Log))).catch(() => setLogs([]));
    getDocs(query(collection(db, "scraping_results"), orderBy("executedAt", "desc"), limit(1))).then(s => setScrape(s.empty ? null : s.docs[0].data())).catch(() => setScrape(null));
  }, []);
  return (
    <>
      <PageHead title="Panel de administración" lead="Resumen general de la cafetería y su comunidad." />
      <Status error={error} />
      {!counts && !error ? <Spinner /> : counts && (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {CARDS.map(([, label, href], i) => <li key={label} className="card"><Link href={href} className="block"><p className="text-sm text-espresso/70">{label}</p><p className="font-display text-4xl tabular-nums">{counts[i]}</p></Link></li>)}
        </ul>
      )}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section aria-labelledby="h-ev" className="card"><div className="mb-3 flex items-baseline justify-between"><h2 id="h-ev" className="text-2xl">Últimos eventos</h2><Link href="/admin/logs" className="text-sm underline">Ver logs</Link></div>
          {!logs ? <Spinner /> : logs.length === 0 ? <p>Aún no hay eventos registrados.</p> : <ul className="space-y-2 text-sm">{logs.map(l => <li key={l.id} className="flex items-start justify-between gap-2 border-b border-espresso/10 pb-2"><span><strong>{l.userName}</strong> · {l.description}<br /><span className="text-espresso/60">{when(l.timestamp)}</span></span><Badge value={l.status} /></li>)}</ul>}
        </section>
        <section aria-labelledby="h-ex" className="card"><div className="mb-3 flex items-baseline justify-between"><h2 id="h-ex" className="text-2xl">Última extracción</h2><Link href="/admin/analisis" className="text-sm underline">Ver análisis</Link></div>
          {scrape === undefined ? <Spinner /> : scrape === null ? <p>Todavía no se ha ejecutado ninguna extracción con Selenium.</p> : (
            <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Fecha</dt><dd>{when(scrape.executedAt)}</dd><dt>Estado</dt><dd><Badge value={scrape.status} /></dd><dt>Páginas</dt><dd>{scrape.pagesVisited}</dd><dt>Productos</dt><dd>{scrape.productsFound}</dd><dt>Publicaciones</dt><dd>{scrape.postsFound}</dd><dt>Duración</dt><dd>{scrape.duration} s</dd></dl>
          )}
        </section>
      </div>
    </>
  );
}
export default function AdminHome() { return <RequireRole roles={["admin"]}><Dashboard /></RequireRole>; }

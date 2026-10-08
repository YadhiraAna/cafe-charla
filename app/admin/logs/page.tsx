"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import RequireRole from "@/components/auth/RequireRole";
import Badge from "@/components/admin/Badge";
import { Empty, Field, PageHead, Spinner, Status } from "@/components/ui";
import type { Log } from "@/types";

const PAGE = 15, BATCH = 200;
const NO_FILTER = { user: "", action: "", module: "", status: "", from: "", to: "" };

/**
 * Consulta de auditoría (solo admin; las reglas de Firestore también lo exigen).
 * Se cargan los últimos N logs ordenados por fecha (más reciente primero) y los filtros/paginación
 * se aplican sobre ellos: así no se necesitan índices compuestos. "Cargar más" amplía la ventana.
 */
function LogsView() {
  const [rows, setRows] = useState<Log[] | null>(null), [error, setError] = useState(""), [n, setN] = useState(BATCH), [f, setF] = useState(NO_FILTER), [page, setPage] = useState(0);
  useEffect(() => {
    setError("");
    getDocs(query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(n))).then(s => setRows(s.docs.map(d => ({ id: d.id, ...d.data() }) as Log))).catch(() => setError("No se pudieron cargar los logs."));
  }, [n]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPage(0); };
  const opts = (key: keyof Log) => Array.from(new Set((rows ?? []).map(r => String(r[key])))).filter(Boolean).sort();
  const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : 0, to = f.to ? new Date(`${f.to}T23:59:59`).getTime() : Infinity;
  const list = (rows ?? []).filter(r => {
    const t = (r.timestamp?.seconds ?? 0) * 1000;
    return (!f.user || r.userName.toLowerCase().includes(f.user.toLowerCase())) && (!f.action || r.action === f.action) && (!f.module || r.module === f.module) && (!f.status || r.status === f.status) && t >= from && t <= to;
  });
  const pages = Math.max(1, Math.ceil(list.length / PAGE)), cur = Math.min(page, pages - 1), view = list.slice(cur * PAGE, cur * PAGE + PAGE);

  return (
    <>
      <PageHead title="Logs de auditoría" lead="Registro inmutable de las acciones del sistema, de la más reciente a la más antigua." />
      <form className="card mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={e => e.preventDefault()} aria-label="Filtros">
        <Field label="Usuario" id="fu"><input id="fu" className="input" placeholder="Nombre o correo" value={f.user} onChange={set("user")} /></Field>
        <Field label="Acción" id="fa"><select id="fa" className="input" value={f.action} onChange={set("action")}><option value="">Todas</option>{opts("action").map(o => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Módulo" id="fm"><select id="fm" className="input" value={f.module} onChange={set("module")}><option value="">Todos</option>{opts("module").map(o => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Estado" id="fs"><select id="fs" className="input" value={f.status} onChange={set("status")}><option value="">Todos</option>{opts("status").map(o => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Desde" id="ff"><input id="ff" className="input" type="date" value={f.from} onChange={set("from")} /></Field>
        <Field label="Hasta" id="ft"><input id="ft" className="input" type="date" value={f.to} min={f.from} onChange={set("to")} /></Field>
        <div className="sm:col-span-2 lg:col-span-3"><button type="button" className="btn-ghost" onClick={() => { setF(NO_FILTER); setPage(0); }}>Limpiar filtros</button></div>
      </form>

      <Status error={error} />
      {!rows && !error ? <Spinner /> : list.length === 0 ? <Empty title="No hay logs con estos filtros" /> : (<>
        <p className="mb-2 text-sm text-espresso/70" role="status">{list.length} registros · mostrando {cur * PAGE + 1} a {cur * PAGE + view.length}</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
          <caption className="sr-only">Registros de auditoría</caption>
          <thead><tr className="border-b border-espresso/30">{["Fecha", "Usuario", "Rol", "Acción", "Módulo", "Recurso", "Estado", "Descripción"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{view.map(l => (
            <tr key={l.id} className="border-b border-espresso/10 align-top">
              <td className="whitespace-nowrap p-2">{l.timestamp ? new Date(l.timestamp.seconds * 1000).toLocaleString("es-MX") : "…"}</td><td className="p-2">{l.userName}</td><td className="p-2">{l.userRole}</td><td className="p-2">{l.action}</td><td className="p-2">{l.module}</td>
              <td className="p-2 break-all">{l.targetType ? `${l.targetType}${l.targetId ? ` · ${l.targetId}` : ""}` : "—"}</td><td className="p-2"><Badge value={l.status} /></td><td className="p-2">{l.description}</td>
            </tr>))}</tbody>
        </table></div>
        <nav aria-label="Paginación" className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn-ghost" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Anterior</button>
          <span className="text-sm">Página {cur + 1} de {pages}</span>
          <button className="btn-ghost" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Siguiente</button>
          {rows && rows.length === n && <button className="btn-primary ml-auto" onClick={() => setN(n + BATCH)}>Cargar {BATCH} más antiguos</button>}
        </nav>
      </>)}
    </>
  );
}
export default function LogsPage() { return <RequireRole roles={["admin"]}><LogsView /></RequireRole>; }

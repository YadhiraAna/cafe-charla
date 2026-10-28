"use client";
import { useState } from "react";
import { limit, where } from "firebase/firestore";
import { apiFetch } from "@/lib/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { useAction } from "@/hooks/useAction";
import { useDocs } from "@/hooks/useDocs";
import RequireRole from "@/components/auth/RequireRole";
import TicketCard, { TicketVista } from "@/components/tickets/TicketCard";
import Badge from "@/components/admin/Badge";
import { Empty, Field, PageHead, Spinner, Status } from "@/components/ui";
import { FiltroFecha, MAX_CANTIDAD, MAX_PERSONAS, estadoTicketTexto, lineaProducto, rangoFiltro } from "@/lib/tickets/reglas";
import type { MenuItem, Ticket } from "@/types";

type Creado = TicketVista & { asociado: boolean };
const ESTADO: Record<string, [string, string]> = { activo: ["success", "Activo"], lleno: ["pending", "Completo"], vencido: ["no", "Vencido"], cancelado: ["error", "Cancelado"] };
const FILTROS: [FiltroFecha, string][] = [["hoy", "Hoy"], ["ayer", "Ayer"], ["7d", "Últimos 7 días"], ["rango", "Rango de fechas"], ["todo", "Todos"]];
const ms = (t?: { seconds: number }) => (t ? t.seconds * 1000 : 0);
const cuando = (n: number) => new Date(n).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

function Cajero() {
  const { user } = useAuth(), a = useAction();
  const menu = useDocs<MenuItem>("menu"), mios = useDocs<Ticket>("tickets", where("waiterId", "==", user!.uid), limit(300));
  const [modo, setModo] = useState<"auto" | "manual">("auto"), [manual, setManual] = useState(""), [cant, setCant] = useState<Record<string, number>>({});
  const [personas, setPersonas] = useState(1), [correo, setCorreo] = useState(""), [vista, setVista] = useState<TicketVista | null>(null);
  const [filtro, setFiltro] = useState<FiltroFecha>("hoy"), [desde, setDesde] = useState(""), [hasta, setHasta] = useState("");
  const ahora = Date.now(), [ini, fin] = rangoFiltro(filtro, new Date(), desde, hasta);
  const lista = [...(mios.data ?? [])].filter(t => ms(t.consumedAt) >= ini && ms(t.consumedAt) < fin).sort((x, y) => ms(y.consumedAt) - ms(x.consumedAt));
  const piezas = lista.reduce((n, t) => n + t.items.reduce((m, i) => m + (i.qty ?? 1), 0), 0);
  const ponerCantidad = (id: string, n: number) => setCant(c => ({ ...c, [id]: Math.max(0, Math.min(MAX_CANTIDAD, Number.isFinite(n) ? Math.floor(n) : 0)) }));

  return (
    <>
      <PageHead title="Panel del cajero" lead="Genera el ticket de una visita. El cliente lo canjea con el código o escaneando el QR." />
      <form className="card mb-8 grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); a.run(async () => {
        const productos = Object.entries(cant).filter(([, n]) => n > 0).map(([id, cantidad]) => ({ id, cantidad }));
        if (productos.length === 0) throw new Error("Indica la cantidad de al menos un producto.");
        let consumidoEn: string | undefined;
        if (modo === "manual") {
          const d = new Date(manual);
          if (!manual || isNaN(d.getTime())) throw new Error("Indica una fecha y hora válidas para el consumo.");
          consumidoEn = d.toISOString();
        }
        const r = await apiFetch<Creado>("/api/tickets", { method: "POST", body: { modoFecha: modo, consumidoEn, productos, personas, correoCliente: correo } });
        setVista(r); setCant({}); setCorreo(""); mios.reload();
        return `Ticket ${r.code} creado correctamente${r.asociado ? " y vinculado a la cuenta del cliente" : r.pendiente ? `; el lugar de ${r.pendiente} quedó apartado y se vinculará al iniciar sesión` : ""}.`;
      }); }}>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-sm font-semibold">Fecha y hora del consumo</legend>
          <label className="mr-4 inline-flex min-h-[44px] items-center gap-2"><input type="radio" name="modo" checked={modo === "auto"} onChange={() => setModo("auto")} />Automática (ahora)</label>
          <label className="inline-flex min-h-[44px] items-center gap-2"><input type="radio" name="modo" checked={modo === "manual"} onChange={() => setModo("manual")} />Manual</label>
          {modo === "manual" && <input aria-label="Fecha y hora del consumo" className="input mt-2 max-w-xs" type="datetime-local" required value={manual} onChange={e => setManual(e.target.value)} />}
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-sm font-semibold">Productos consumidos (cantidad de cada uno)</legend>
          {!menu.data ? <Spinner /> : <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">{[...menu.data].sort((x, y) => x.name.localeCompare(y.name)).map(m => (
            <label key={m.id} className="flex min-h-[44px] items-center justify-between gap-2 rounded border border-espresso/15 px-2">
              <span>{m.name} <span className="text-xs text-espresso/60">{m.size}{!m.available && " · agotado"}</span></span>
              <input type="number" min={0} max={MAX_CANTIDAD} step={1} aria-label={`Cantidad de ${m.name}`} className="input !min-h-[36px] !w-20" value={cant[m.id] ?? 0} onChange={e => ponerCantidad(m.id, Number(e.target.value))} />
            </label>))}</div>}
        </fieldset>
        <Field label="Personas de la visita" id="personas" hint={`De 1 a ${MAX_PERSONAS}. Define cuántas cuentas distintas pueden canjear el ticket.`}>
          <input id="personas" className="input" type="number" min={1} max={MAX_PERSONAS} step={1} required value={personas} onChange={e => setPersonas(Number(e.target.value))} /></Field>
        <Field label="Correo del cliente (opcional)" id="correo" hint="Se verifica antes de crear el ticket. Si ya tiene cuenta se vincula al instante; si no, su lugar queda apartado y se vincula solo cuando inicie sesión.">
          <input id="correo" className="input" type="email" value={correo} onChange={e => setCorreo(e.target.value)} /></Field>
        <div className="md:col-span-2"><Status error={a.error} done={a.done} /></div>
        <div className="md:col-span-2"><button className="btn-primary" disabled={a.busy}>{a.busy ? "Verificando y generando…" : "Generar ticket"}</button></div>
      </form>

      {vista && <section aria-label="Ticket generado" className="mb-8"><TicketCard t={vista} /></section>}

      <section aria-labelledby="h-mios" className="no-print">
        <h2 id="h-mios" className="mb-3 text-2xl">Historial de tickets</h2>
        <div className="card mb-4 flex flex-wrap items-end gap-3">
          <div role="group" aria-label="Filtrar por fecha de consumo" className="flex flex-wrap gap-2">
            {FILTROS.map(([k, l]) => <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} className={`btn border !min-h-[36px] ${filtro === k ? "border-espresso bg-espresso text-espuma" : "border-espresso/30"}`}>{l}</button>)}
          </div>
          {filtro === "rango" && (<>
            <Field label="Desde" id="desde"><input id="desde" type="date" className="input" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /></Field>
            <Field label="Hasta" id="hasta"><input id="hasta" type="date" className="input" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></Field>
          </>)}
          <p className="ml-auto text-sm" role="status">{lista.length} ticket(s) · {piezas} pieza(s)</p>
        </div>
        <Status error={mios.error} />
        {!mios.data && !mios.error ? <Spinner /> : lista.length === 0 ? <Empty title="No hay tickets en este periodo">{filtro === "hoy" ? "Todavía no has generado tickets hoy." : "Prueba con otro filtro de fecha."}</Empty> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><caption className="sr-only">Tickets generados por ti</caption>
            <thead><tr className="border-b border-espresso/30">{["Código", "Consumo", "Productos", "Personas", "Usos", "Vinculado a", "Estado", "Acciones"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{lista.map(t => {
              const est = estadoTicketTexto({ status: t.status, uses: t.uses, maxUses: t.maxUses, expiresAtMs: ms(t.expiresAt) }, ahora), [tono, texto] = ESTADO[est];
              return (<tr key={t.id} className="border-b border-espresso/10 align-top">
                <th scope="row" className="p-2 font-semibold">{t.code}</th><td className="p-2">{cuando(ms(t.consumedAt))}</td><td className="p-2">{t.items.map(lineaProducto).join(", ")}</td>
                <td className="p-2">{t.people}</td><td className="p-2 tabular-nums">{t.uses}/{t.maxUses}</td>
                <td className="p-2">{t.participantes?.map(p => `${p.nombre} (${p.correo})`).join(", ") || "—"}{t.invitedMask && !t.participantes?.some(() => true) ? <span className="block text-espresso/70">Reservado: {t.invitedMask}</span> : t.invitedMask && (t.reservado ?? 0) > 0 ? <span className="block text-espresso/70">Reservado: {t.invitedMask}</span> : null}</td>
                <td className="p-2"><Badge value={tono} label={texto} /></td>
                <td className="flex flex-wrap gap-2 p-2">
                  <button className="btn-ghost !min-h-[36px]" onClick={() => { setVista({ code: t.code, consumedAtMs: ms(t.consumedAt), items: t.items, people: t.people, expiresAtMs: ms(t.expiresAt), uses: t.uses, maxUses: t.maxUses, participantes: t.participantes, pendiente: (t.reservado ?? 0) > 0 ? t.invitedMask : "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Ver QR</button>
                  {est === "activo" && <button className="btn-danger !min-h-[36px]" disabled={a.busy} onClick={() => window.confirm(`¿Cancelar el ticket ${t.code}?`) && a.run(async () => { await apiFetch(`/api/tickets/${t.id}`, { method: "PATCH" }); mios.reload(); return "Ticket cancelado."; })}>Cancelar</button>}
                </td></tr>); })}</tbody></table></div>)}
        {(mios.data?.length ?? 0) >= 300 && <p className="mt-2 text-xs text-espresso/60">Se muestran tus últimos 300 tickets.</p>}
      </section>
    </>
  );
}
export default function CajeroPage() { return <RequireRole roles={["waiter"]}><Cajero /></RequireRole>; }
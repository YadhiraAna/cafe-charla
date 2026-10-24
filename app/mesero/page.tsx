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
import { MAX_PERSONAS, estadoTicketTexto } from "@/lib/tickets/reglas";
import type { MenuItem, Ticket } from "@/types";

type Creado = TicketVista & { asociado: boolean };
const ESTADO: Record<string, [string, string]> = { activo: ["success", "Activo"], lleno: ["pending", "Completo"], vencido: ["no", "Vencido"], cancelado: ["error", "Cancelado"] };
const ms = (t?: { seconds: number }) => (t ? t.seconds * 1000 : 0);
const cuando = (n: number) => new Date(n).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

function Mesero() {
  const { user } = useAuth(), a = useAction();
  const menu = useDocs<MenuItem>("menu"), mios = useDocs<Ticket>("tickets", where("waiterId", "==", user!.uid), limit(50));
  const [modo, setModo] = useState<"auto" | "manual">("auto"), [manual, setManual] = useState(""), [sel, setSel] = useState<string[]>([]);
  const [personas, setPersonas] = useState(1), [correo, setCorreo] = useState(""), [vista, setVista] = useState<TicketVista | null>(null);
  const alternar = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const ahora = Date.now();

  return (
    <>
      <PageHead title="Panel del mesero" lead="Genera el ticket de una visita. El cliente lo canjea con el código o escaneando el QR." />
      <form className="card mb-8 grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); a.run(async () => {
        if (sel.length === 0) throw new Error("Selecciona al menos un producto.");
        let consumidoEn: string | undefined;
        if (modo === "manual") {
          const d = new Date(manual);
          if (!manual || isNaN(d.getTime())) throw new Error("Indica una fecha y hora válidas para el consumo.");
          consumidoEn = d.toISOString();
        }
        const r = await apiFetch<Creado>("/api/tickets", { method: "POST", body: { modoFecha: modo, consumidoEn, productos: sel, personas, correoCliente: correo } });
        setVista(r); setSel([]); setCorreo(""); mios.reload();
        return `Ticket ${r.code} creado correctamente${r.asociado ? " y asociado a la cuenta del cliente" : ""}.`;
      }); }}>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-sm font-semibold">Fecha y hora del consumo</legend>
          <label className="mr-4 inline-flex min-h-[44px] items-center gap-2"><input type="radio" name="modo" checked={modo === "auto"} onChange={() => setModo("auto")} />Automática (ahora)</label>
          <label className="inline-flex min-h-[44px] items-center gap-2"><input type="radio" name="modo" checked={modo === "manual"} onChange={() => setModo("manual")} />Manual</label>
          {modo === "manual" && <input aria-label="Fecha y hora del consumo" className="input mt-2 max-w-xs" type="datetime-local" required value={manual} onChange={e => setManual(e.target.value)} />}
        </fieldset>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-sm font-semibold">Productos consumidos</legend>
          {!menu.data ? <Spinner /> : <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-3">{[...menu.data].sort((x, y) => x.name.localeCompare(y.name)).map(m => (
            <label key={m.id} className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={sel.includes(m.id)} onChange={() => alternar(m.id)} />{m.name} <span className="text-xs text-espresso/60">{m.size}</span></label>))}</div>}
        </fieldset>
        <Field label="Personas de la visita" id="personas" hint={`De 1 a ${MAX_PERSONAS}. Define cuántas cuentas distintas pueden canjear el ticket.`}>
          <input id="personas" className="input" type="number" min={1} max={MAX_PERSONAS} step={1} required value={personas} onChange={e => setPersonas(Number(e.target.value))} /></Field>
        <Field label="Correo del cliente (opcional)" id="correo" hint="Si ya tiene cuenta, el ticket se asocia a ella automáticamente."><input id="correo" className="input" type="email" value={correo} onChange={e => setCorreo(e.target.value)} /></Field>
        <div className="md:col-span-2"><Status error={a.error} done={a.done} /></div>
        <div className="md:col-span-2"><button className="btn-primary" disabled={a.busy}>{a.busy ? "Generando…" : "Generar ticket"}</button></div>
      </form>

      {vista && <section aria-label="Ticket generado" className="mb-8"><TicketCard t={vista} /></section>}

      <section aria-labelledby="h-mios" className="no-print">
        <h2 id="h-mios" className="mb-3 text-2xl">Tus tickets recientes</h2>
        <Status error={mios.error} />
        {!mios.data && !mios.error ? <Spinner /> : mios.data?.length === 0 ? <Empty title="Aún no has generado tickets" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Tickets generados por ti</caption>
            <thead><tr className="border-b border-espresso/30">{["Código", "Consumo", "Productos", "Personas", "Usos", "Estado", "Acciones"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{[...mios.data!].sort((x, y) => ms(y.createdAt) - ms(x.createdAt)).map(t => {
              const est = estadoTicketTexto({ status: t.status, uses: t.uses, maxUses: t.maxUses, expiresAtMs: ms(t.expiresAt) }, ahora), [tono, texto] = ESTADO[est];
              return (<tr key={t.id} className="border-b border-espresso/10">
                <th scope="row" className="p-2 font-semibold">{t.code}</th><td className="p-2">{cuando(ms(t.consumedAt))}</td><td className="p-2">{t.items.map(i => i.name).join(", ")}</td>
                <td className="p-2">{t.people}</td><td className="p-2 tabular-nums">{t.uses}/{t.maxUses}</td><td className="p-2"><Badge value={tono} label={texto} /></td>
                <td className="flex flex-wrap gap-2 p-2">
                  <button className="btn-ghost !min-h-[36px]" onClick={() => { setVista({ code: t.code, consumedAtMs: ms(t.consumedAt), items: t.items, people: t.people, expiresAtMs: ms(t.expiresAt), uses: t.uses, maxUses: t.maxUses }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Ver QR</button>
                  {est === "activo" && <button className="btn-danger !min-h-[36px]" disabled={a.busy} onClick={() => window.confirm(`¿Cancelar el ticket ${t.code}?`) && a.run(async () => { await apiFetch(`/api/tickets/${t.id}`, { method: "PATCH" }); mios.reload(); return "Ticket cancelado."; })}>Cancelar</button>}
                </td></tr>); })}</tbody></table></div>)}
      </section>
    </>
  );
}
export default function MeseroPage() { return <RequireRole roles={["waiter"]}><Mesero /></RequireRole>; }
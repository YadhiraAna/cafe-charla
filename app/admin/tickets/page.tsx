"use client";
import { limit, orderBy } from "firebase/firestore";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import { useDocs } from "@/hooks/useDocs";
import RequireRole from "@/components/auth/RequireRole";
import Badge from "@/components/admin/Badge";
import { Empty, PageHead, Spinner, Status } from "@/components/ui";
import { estadoTicketTexto } from "@/lib/tickets/reglas";
import type { Ticket } from "@/types";

const ESTADO: Record<string, [string, string]> = { activo: ["success", "Activo"], lleno: ["pending", "Completo"], vencido: ["no", "Vencido"], cancelado: ["error", "Cancelado"] };
const ms = (t?: { seconds: number }) => (t ? t.seconds * 1000 : 0);
const cuando = (n: number) => new Date(n).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

function TicketsAdmin() {
  const a = useAction(), { data, error, reload } = useDocs<Ticket>("tickets", orderBy("createdAt", "desc"), limit(100)), ahora = Date.now();
  return (
    <>
      <PageHead title="Tickets de consumo" lead="Todos los tickets generados por los meseros. Para dar a alguien el rol Mesero, ve a Usuarios." />
      <Status error={error || a.error} done={a.done} />
      {!data && !error ? <Spinner /> : data?.length === 0 ? <Empty title="Aún no hay tickets" /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><caption className="sr-only">Tickets</caption>
          <thead><tr className="border-b border-espresso/30">{["Código", "Mesero", "Consumo", "Productos", "Personas", "Usos", "Vence", "Estado", ""].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{data?.map(t => { const est = estadoTicketTexto({ status: t.status, uses: t.uses, maxUses: t.maxUses, expiresAtMs: ms(t.expiresAt) }, ahora), [tono, texto] = ESTADO[est]; return (
            <tr key={t.id} className="border-b border-espresso/10">
              <th scope="row" className="p-2 font-semibold">{t.code}</th><td className="p-2">{t.waiterName}</td><td className="p-2">{cuando(ms(t.consumedAt))}</td><td className="p-2">{t.items.map(i => i.name).join(", ")}</td>
              <td className="p-2">{t.people}</td><td className="p-2 tabular-nums">{t.uses}/{t.maxUses}</td><td className="p-2">{cuando(ms(t.expiresAt))}</td><td className="p-2"><Badge value={tono} label={texto} /></td>
              <td className="p-2">{est === "activo" && <button className="btn-danger !min-h-[36px]" disabled={a.busy} onClick={() => window.confirm(`¿Cancelar el ticket ${t.code}?`) && a.run(async () => { await apiFetch(`/api/tickets/${t.id}`, { method: "PATCH" }); reload(); return "Ticket cancelado."; })}>Cancelar</button>}</td></tr>); })}</tbody></table></div>)}
    </>
  );
}
export default function TicketsAdminPage() { return <RequireRole roles={["admin"]}><TicketsAdmin /></RequireRole>; }
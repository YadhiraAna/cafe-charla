"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import { useDocs } from "@/hooks/useDocs";
import RequireRole from "@/components/auth/RequireRole";
import ImageUpload, { Uploaded } from "@/components/forum/ImageUpload";
import Badge from "@/components/admin/Badge";
import { Empty, Field, PageHead, Spinner, Status } from "@/components/ui";
import { today } from "@/lib/utils/format";
import type { Promotion } from "@/types";

const EMPTY = { title: "", description: "", discount: "", startDate: "", endDate: "", active: true };

function PromosAdmin() {
  const a = useAction(), { data, error, reload } = useDocs<Promotion>("promotions");
  const [f, setF] = useState(EMPTY), [editId, setEditId] = useState(""), [img, setImg] = useState<Uploaded | null>(null), [k, setK] = useState(0);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<any>) => setF({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const reset = () => { setF(EMPTY); setEditId(""); setImg(null); setK(n => n + 1); };
  const act = (fn: () => Promise<void>, msg: string) => a.run(async () => { await fn(); reload(); return msg; });
  const vigente = (p: Promotion) => p.active && p.startDate <= today() && p.endDate >= today();

  return (
    <>
      <PageHead title="Promociones" lead="Una promoción se muestra al público solo si está activa y dentro de sus fechas." />
      <form className="card mb-8 grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); act(async () => {
        const body = { ...f, discount: parseFloat(f.discount), ...(img && { imageUrl: img.imageUrl, imagePublicId: img.publicId }) };
        await apiFetch(editId ? `/api/promotions/${editId}` : "/api/promotions", { method: editId ? "PATCH" : "POST", body }); reset();
      }, editId ? "Promoción actualizada." : "Promoción creada."); }}>
        <h2 className="text-2xl md:col-span-2">{editId ? "Editar promoción" : "Nueva promoción"}</h2>
        <Field label="Título" id="title"><input id="title" className="input" required minLength={3} maxLength={100} value={f.title} onChange={set("title")} /></Field>
        <Field label="Descuento (%)" id="disc"><input id="disc" className="input" type="number" min="0" max="100" step="1" required value={f.discount} onChange={set("discount")} /></Field>
        <Field label="Descripción" id="desc"><textarea id="desc" className="input" required minLength={5} maxLength={300} value={f.description} onChange={set("description")} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Inicio" id="start"><input id="start" className="input" type="date" required value={f.startDate} onChange={set("startDate")} /></Field>
          <Field label="Fin" id="end"><input id="end" className="input" type="date" required min={f.startDate} value={f.endDate} onChange={set("endDate")} /></Field>
        </div>
        <ImageUpload key={k} purpose="promo" label={editId ? "Reemplazar imagen (opcional)" : "Imagen (opcional)"} onUploaded={setImg} />
        <label className="flex min-h-[44px] items-center gap-2 self-end"><input type="checkbox" checked={f.active} onChange={set("active")} />Promoción activa</label>
        <div className="flex gap-2 md:col-span-2"><button className="btn-primary" disabled={a.busy}>{a.busy ? "Guardando…" : editId ? "Guardar cambios" : "Crear promoción"}</button>{editId && <button type="button" className="btn-ghost" onClick={reset}>Cancelar edición</button>}</div>
        <div className="md:col-span-2"><Status error={a.error} done={a.done} /></div>
      </form>

      <Status error={error} />
      {!data && !error ? <Spinner /> : data?.length === 0 ? <Empty title="No hay promociones">Crea la primera con el formulario de arriba.</Empty> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
          <caption className="sr-only">Promociones</caption>
          <thead><tr className="border-b border-espresso/30"><th scope="col" className="p-2">Título</th><th scope="col" className="p-2">Descuento</th><th scope="col" className="p-2">Fechas</th><th scope="col" className="p-2">Estado</th><th scope="col" className="p-2">Acciones</th></tr></thead>
          <tbody>{data?.sort((x, y) => y.startDate.localeCompare(x.startDate)).map(p => (
            <tr key={p.id} className="border-b border-espresso/10">
              <td className="p-2 font-semibold">{p.title}</td><td className="p-2">{p.discount}%</td><td className="p-2">{p.startDate} a {p.endDate}</td>
              <td className="p-2"><Badge value={vigente(p) ? "active" : "no"} label={vigente(p) ? "Vigente" : p.active ? "Fuera de fechas" : "Inactiva"} /></td>
              <td className="flex flex-wrap gap-2 p-2">
                <button className="btn-ghost !min-h-[36px]" onClick={() => { setEditId(p.id); setF({ title: p.title, description: p.description, discount: String(p.discount), startDate: p.startDate, endDate: p.endDate, active: p.active }); setImg(null); setK(n => n + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button>
                <button className="btn-ghost !min-h-[36px]" disabled={a.busy} onClick={() => act(() => apiFetch(`/api/promotions/${p.id}`, { method: "PATCH", body: { active: !p.active } }), "Estado actualizado.")}>{p.active ? "Desactivar" : "Activar"}</button>
                <button className="btn-danger !min-h-[36px]" disabled={a.busy} onClick={() => window.confirm(`¿Eliminar "${p.title}"?`) && act(() => apiFetch(`/api/promotions/${p.id}`, { method: "DELETE" }), "Promoción eliminada.")}>Eliminar</button>
              </td>
            </tr>))}</tbody>
        </table></div>)}
    </>
  );
}
export default function PromosAdminPage() { return <RequireRole roles={["admin"]}><PromosAdmin /></RequireRole>; }

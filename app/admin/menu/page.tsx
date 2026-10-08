"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import { useDocs } from "@/hooks/useDocs";
import RequireRole from "@/components/auth/RequireRole";
import ImageUpload, { Uploaded } from "@/components/forum/ImageUpload";
import Badge from "@/components/admin/Badge";
import { Empty, Field, PageHead, Spinner, Status } from "@/components/ui";
import { money } from "@/lib/utils/format";
import { CATEGORIES, MenuItem } from "@/types";

const EMPTY = { name: "", description: "", category: "Café", size: "", price: "", available: true };

function MenuAdmin() {
  const a = useAction(), { data, error, reload } = useDocs<MenuItem>("menu");
  const [f, setF] = useState(EMPTY), [editId, setEditId] = useState(""), [img, setImg] = useState<Uploaded | null>(null), [k, setK] = useState(0);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<any>) => setF({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const reset = () => { setF(EMPTY); setEditId(""); setImg(null); setK(n => n + 1); };
  const act = (fn: () => Promise<void>, msg: string) => a.run(async () => { await fn(); reload(); return msg; });

  return (
    <>
      <PageHead title="Menú" lead="Crea, edita, activa o elimina productos. Los cambios se ven de inmediato en el sitio público." />
      <form className="card mb-8 grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); act(async () => {
        const body = { ...f, price: parseFloat(f.price), ...(img && { imageUrl: img.imageUrl, imagePublicId: img.publicId }) };
        await apiFetch(editId ? `/api/menu/${editId}` : "/api/menu", { method: editId ? "PATCH" : "POST", body }); reset();
      }, editId ? "Producto actualizado." : "Producto creado."); }}>
        <h2 className="text-2xl md:col-span-2">{editId ? "Editar producto" : "Nuevo producto"}</h2>
        <Field label="Nombre" id="name"><input id="name" className="input" required minLength={2} maxLength={80} value={f.name} onChange={set("name")} /></Field>
        <Field label="Categoría" id="cat"><select id="cat" className="input" value={f.category} onChange={set("category")}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Descripción" id="desc"><textarea id="desc" className="input" required minLength={5} maxLength={300} value={f.description} onChange={set("description")} /></Field>
        <div className="space-y-4">
          <Field label="Tamaño" id="size" hint="Ej.: 12 oz, Rebanada, Taza"><input id="size" className="input" required maxLength={30} value={f.size} onChange={set("size")} /></Field>
          <Field label="Precio (MXN)" id="price"><input id="price" className="input" type="number" step="0.01" min="0.01" max="9999" required value={f.price} onChange={set("price")} /></Field>
        </div>
        <ImageUpload key={k} purpose="menu" label={editId ? "Reemplazar imagen (opcional)" : "Imagen (opcional)"} onUploaded={setImg} />
        <label className="flex min-h-[44px] items-center gap-2 self-end"><input type="checkbox" checked={f.available} onChange={set("available")} />Disponible para la venta</label>
        <div className="flex gap-2 md:col-span-2"><button className="btn-primary" disabled={a.busy}>{a.busy ? "Guardando…" : editId ? "Guardar cambios" : "Crear producto"}</button>{editId && <button type="button" className="btn-ghost" onClick={reset}>Cancelar edición</button>}</div>
        <div className="md:col-span-2"><Status error={a.error} done={a.done} /></div>
      </form>

      <Status error={error} />
      {!data && !error ? <Spinner /> : data?.length === 0 ? <Empty title="El menú está vacío">Crea el primer producto con el formulario de arriba.</Empty> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Productos del menú</caption>
          <thead><tr className="border-b border-espresso/30"><th scope="col" className="p-2">Producto</th><th scope="col" className="p-2">Categoría</th><th scope="col" className="p-2">Precio</th><th scope="col" className="p-2">Disponible</th><th scope="col" className="p-2">Acciones</th></tr></thead>
          <tbody>{data?.sort((x, y) => x.name.localeCompare(y.name)).map(m => (
            <tr key={m.id} className="border-b border-espresso/10">
              <td className="p-2 font-semibold">{m.name} <span className="font-normal text-espresso/60">{m.size}</span></td><td className="p-2">{m.category}</td><td className="p-2 tabular-nums">{money(m.price)}</td><td className="p-2"><Badge value={m.available ? "yes" : "no"} /></td>
              <td className="flex flex-wrap gap-2 p-2">
                <button className="btn-ghost !min-h-[36px]" onClick={() => { setEditId(m.id); setF({ name: m.name, description: m.description, category: m.category, size: m.size, price: String(m.price), available: m.available }); setImg(null); setK(n => n + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button>
                <button className="btn-ghost !min-h-[36px]" disabled={a.busy} onClick={() => act(() => apiFetch(`/api/menu/${m.id}`, { method: "PATCH", body: { available: !m.available } }), "Disponibilidad actualizada.")}>{m.available ? "Desactivar" : "Activar"}</button>
                <button className="btn-danger !min-h-[36px]" disabled={a.busy} onClick={() => window.confirm(`¿Eliminar "${m.name}"?`) && act(() => apiFetch(`/api/menu/${m.id}`, { method: "DELETE" }), "Producto eliminado.")}>Eliminar</button>
              </td>
            </tr>))}</tbody>
        </table></div>)}
    </>
  );
}
export default function MenuAdminPage() { return <RequireRole roles={["admin"]}><MenuAdmin /></RequireRole>; }

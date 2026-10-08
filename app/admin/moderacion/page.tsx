"use client";
import Link from "next/link";
import { useState } from "react";
import { limit, orderBy } from "firebase/firestore";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import { useDocs } from "@/hooks/useDocs";
import Badge from "@/components/admin/Badge";
import { Empty, PageHead, Spinner, Status, Stars } from "@/components/ui";
import { fmtDate } from "@/lib/utils/format";

type Kind = "post" | "comment" | "review";
const TABS: { kind: Kind; col: string; label: string }[] = [{ kind: "post", col: "posts", label: "Publicaciones" }, { kind: "comment", col: "comments", label: "Comentarios" }, { kind: "review", col: "reviews", label: "Reseñas" }];

/** Página de moderación (moderador y admin). Cambia estados vía /api/moderation y elimina vía las APIs del recurso. */
export default function ModerationPage() {
  const [tab, setTab] = useState(TABS[0]), [filter, setFilter] = useState("all"), a = useAction();
  const { data, error, reload } = useDocs<any>(tab.col, orderBy("createdAt", "desc"), limit(100));
  const rows = data?.filter(r => filter === "all" || r.status === filter);
  const setStatus = (id: string, status: string) => a.run(async () => { await apiFetch("/api/moderation", { method: "POST", body: { type: tab.kind, id, status } }); reload(); return "Estado actualizado."; });
  const remove = (id: string) => window.confirm("¿Eliminar definitivamente este contenido?") && a.run(async () => { await apiFetch(`/api/${tab.col}/${id}`, { method: "DELETE" }); reload(); return "Contenido eliminado."; });
  return (
    <>
      <PageHead title="Moderación" lead="Revisa el contenido de la comunidad. Cada acción queda registrada en los logs." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Tipo de contenido" className="flex gap-2">{TABS.map(t => <button key={t.kind} aria-pressed={tab.kind === t.kind} onClick={() => { setTab(t); setFilter("all"); }} className={`btn border ${tab.kind === t.kind ? "border-espresso bg-espresso text-espuma" : "border-espresso/30"}`}>{t.label}</button>)}</div>
        <div><label htmlFor="f" className="block text-sm font-semibold">Estado</label><select id="f" className="input !w-auto" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos</option><option value="published">Publicado</option><option value="pending">Pendiente</option><option value="hidden">Oculto</option></select></div>
      </div>
      <Status error={error || a.error} done={a.done} />
      {!data && !error ? <Spinner /> : rows?.length === 0 ? <Empty title="No hay contenido con este filtro" /> : (
        <ul className="space-y-3">{rows?.map(r => (
          <li key={r.id} className="card space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-espresso/70">{r.authorName} · {fmtDate(r.createdAt)}</p><Badge value={r.status} /></div>
            {tab.kind === "post" && <h2 className="text-xl">{r.title}</h2>}
            {tab.kind === "review" && <p><Stars value={r.rating} /> <strong>{r.product}</strong></p>}
            <p className="line-clamp-3 whitespace-pre-wrap">{r.content}</p>
            <div className="flex flex-wrap gap-2">
              {tab.kind === "post" && <Link href={`/foro/${r.id}`} className="btn-ghost !min-h-[36px]">Ver</Link>}
              <button className="btn-ghost !min-h-[36px]" disabled={a.busy || r.status === "published"} onClick={() => setStatus(r.id, "published")}>Aprobar</button>
              <button className="btn-ghost !min-h-[36px]" disabled={a.busy || r.status === "pending"} onClick={() => setStatus(r.id, "pending")}>Dejar pendiente</button>
              <button className="btn-ghost !min-h-[36px]" disabled={a.busy || r.status === "hidden"} onClick={() => setStatus(r.id, "hidden")}>Ocultar</button>
              <button className="btn-danger !min-h-[36px]" disabled={a.busy} onClick={() => remove(r.id)}>Eliminar</button>
            </div>
          </li>))}</ul>
      )}
    </>
  );
}

"use client";
import { useState } from "react";
import { useDocs } from "@/hooks/useDocs";
import { Empty, PageHead, Spinner, Status } from "@/components/ui";
import { money } from "@/lib/utils/format";
import { useDom } from "@/components/antibot/DomProvider";
import { CATEGORIES, MenuItem } from "@/types";

export default function MenuPage() {
  const { data, error } = useDocs<MenuItem>("menu"), [cat, setCat] = useState<string>("Todos"), h = useDom();
  const items = data?.filter(m => cat === "Todos" || m.category === cat).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageHead title="Menú" lead="Todo se prepara al momento. Los precios están en pesos mexicanos." />
      <div role="group" aria-label="Filtrar por categoría" className="mb-6 flex flex-wrap gap-2">
        {["Todos", ...CATEGORIES].map(c => <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)} className={`btn border ${cat === c ? "border-espresso bg-espresso text-espuma" : "border-espresso/30"}`}>{c}</button>)}
      </div>
      <Status error={error} />
      {!data && !error ? <Spinner /> : items && items.length === 0 ? <Empty title="No hay productos en esta categoría" /> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items?.map(m => (
            <li key={m.id} {...h("menu-item")} className={`card flex flex-col gap-2 ${m.available ? "" : "opacity-60"}`}>
              {m.imageUrl && <img src={m.imageUrl} alt={m.name} loading="lazy" className="h-40 w-full rounded-md object-cover" />}
              <div className="flex items-baseline justify-between gap-2"><h2 {...h("menu-name")} className="text-xl">{m.name}</h2><span {...h("menu-price")} className="tabular-nums font-semibold">{money(m.price)}</span></div>
              <p className="text-sm text-espresso/75">{m.description}</p>
              <p {...h("menu-meta")} className="mt-auto text-xs text-espresso/60">{m.category} · {m.size}{!m.available && " · Agotado"}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

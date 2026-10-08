"use client";
import { useDocs } from "@/hooks/useDocs";
import { Empty, PageHead, Spinner, Status } from "@/components/ui";
import { today } from "@/lib/utils/format";
import { useDom } from "@/components/antibot/DomProvider";
import type { Promotion } from "@/types";

/** Vigente = active === true y la fecha de hoy está dentro del rango. */
export default function PromosPage() {
  const { data, error } = useDocs<Promotion>("promotions"), h = useDom();
  const vigentes = data?.filter(p => p.active && p.startDate <= today() && p.endDate >= today());
  return (
    <>
      <PageHead title="Promociones" lead="Ofertas activas esta semana. Preséntalas en caja." />
      <Status error={error} />
      {!data && !error ? <Spinner /> : vigentes && vigentes.length === 0 ? <Empty title="No hay promociones vigentes">Vuelve pronto, renovamos las ofertas cada semana.</Empty> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {vigentes?.map(p => (
            <li key={p.id} {...h("promo-item")} className="card flex gap-4">
              {p.imageUrl && <img src={p.imageUrl} alt={p.title} loading="lazy" className="h-28 w-28 shrink-0 rounded-md object-cover" />}
              <div><p {...h("promo-discount")} className="font-display text-3xl text-caramelo">{p.discount}% off</p><h2 {...h("promo-title")} className="text-xl">{p.title}</h2><p className="text-sm text-espresso/75">{p.description}</p><p className="mt-2 text-xs text-espresso/60">Válida del {p.startDate} al {p.endDate}</p></div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

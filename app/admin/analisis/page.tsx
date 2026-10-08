"use client";
import { useEffect, useState } from "react";
import { collection, getCountFromServer, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useDocs } from "@/hooks/useDocs";
import RequireRole from "@/components/auth/RequireRole";
import Badge from "@/components/admin/Badge";
import { Empty, PageHead, Spinner, Status } from "@/components/ui";
import { money, today } from "@/lib/utils/format";
import type { MenuItem, Promotion, Ts } from "@/types";

interface Scrape { id: string; executedAt?: Ts; status: string; pagesVisited: number; productsFound: number; promotionsFound: number; postsFound: number; commentsFound: number; reviewsFound?: number; imagesFound: number; linksFound: number; duration: number; outputFile: string; details?: any }
const STATS: [keyof Scrape, string][] = [["productsFound", "Productos"], ["promotionsFound", "Promociones"], ["postsFound", "Publicaciones"], ["commentsFound", "Comentarios"], ["reviewsFound", "Reseñas"], ["imagesFound", "Imágenes"], ["linksFound", "Enlaces"]];
const when = (t?: Ts) => (t ? new Date(t.seconds * 1000).toLocaleString("es-MX") : "");
const delta = (a: number, b?: number) => (b === undefined ? "—" : a - b > 0 ? `+${a - b}` : a - b === 0 ? "0 (sin cambios)" : String(a - b));

function Analysis() {
  const { data, error } = useDocs<Scrape>("scraping_results", orderBy("executedAt", "desc"), limit(15));
  const menu = useDocs<MenuItem>("menu"), promos = useDocs<Promotion>("promotions");
  const [sel, setSel] = useState(0), [live, setLive] = useState<{ posts: number; comments: number; reviews: number } | null>(null);
  useEffect(() => {
    Promise.all(["posts", "comments", "reviews"].map(c => getCountFromServer(query(collection(db, c), where("status", "==", "published")))))
      .then(r => setLive({ posts: r[0].data().count, comments: r[1].data().count, reviews: r[2].data().count })).catch(() => setLive(null));
  }, []);
  const cur = data?.[sel], prev = data?.[sel + 1], d = cur?.details ?? {};
  const vigentes = promos.data?.filter(p => p.active && p.startDate <= today() && p.endDate >= today()).length;
  const cats = Object.entries<number>(d.categories ?? {}), maxCat = Math.max(1, ...cats.map(([, n]) => n));
  const compare: [string, number | undefined, number | undefined][] = cur ? [["Productos", menu.data?.length, cur.productsFound], ["Promociones vigentes", vigentes, cur.promotionsFound], ["Publicaciones", live?.posts, cur.postsFound], ["Comentarios", live?.comments, cur.commentsFound], ["Reseñas", live?.reviews, cur.reviewsFound]] : [];

  return (
    <>
      <PageHead title="Análisis del sitio" lead="Resultados de las extracciones con Selenium: estadísticas, verificaciones y cambios entre ejecuciones." />
      <details className="card mb-6"><summary className="cursor-pointer font-semibold">Cómo ejecutar una extracción</summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm"><li>Con la app corriendo, abre una terminal en la carpeta <code>selenium</code>.</li><li>Define <code>SCRAPER_API_KEY</code> con el mismo valor de tu <code>.env.local</code>.</li><li>Ejecuta <code>python extractor.py --base-url http://localhost:3000</code>.</li><li>Recarga esta página para ver el resultado.</li></ol></details>
      <Status error={error} />
      {!data && !error ? <Spinner /> : !cur ? <Empty title="Todavía no hay extracciones">Ejecuta el extractor de Selenium (instrucciones arriba) y el resultado aparecerá aquí.</Empty> : (<>
        <section aria-labelledby="h-res" className="mb-8">
          <h2 id="h-res" className="mb-1 text-2xl">{sel === 0 ? "Última extracción" : "Extracción seleccionada"}</h2>
          <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-espresso/70">{when(cur.executedAt)} · {cur.duration} s · {cur.pagesVisited} páginas <Badge value={cur.status} /></p>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">{STATS.map(([k, label]) => <li key={k} className="card"><p className="text-sm text-espresso/70">{label}</p><p className="font-display text-4xl tabular-nums">{(cur[k] as number) ?? 0}</p></li>)}</ul>
        </section>

        <section aria-labelledby="h-chk" className="card mb-8"><h2 id="h-chk" className="mb-3 text-2xl">Verificaciones del sitio</h2>
          {(d.checks ?? []).length === 0 ? <p>Sin verificaciones en esta extracción.</p> : <ul className="space-y-2">{d.checks.map((c: any) => <li key={c.name} className="flex flex-wrap items-center justify-between gap-2 border-b border-espresso/10 pb-2"><span>{c.name} <span className="text-sm text-espresso/60">({c.detail})</span></span><Badge value={c.ok ? "success" : "error"} label={c.ok ? "Correcto" : "Revisar"} /></li>)}</ul>}
          {(d.errors ?? []).length > 0 && <div className="mt-3 text-sm text-rojo"><p className="font-semibold">Errores detectados:</p><ul className="list-disc pl-5">{d.errors.map((e: string) => <li key={e}>{e}</li>)}</ul></div>}
        </section>

        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <section aria-labelledby="h-cat" className="card"><h2 id="h-cat" className="mb-3 text-2xl">Productos por categoría</h2>
            {cats.length === 0 ? <p>Sin datos de categorías.</p> : <ul className="space-y-2">{cats.map(([c, n]) => <li key={c}><div className="flex justify-between text-sm"><span>{c}</span><span className="tabular-nums">{n}</span></div><div aria-hidden className="h-3 rounded bg-espresso/10"><div className="h-3 rounded bg-caramelo" style={{ width: `${(n / maxCat) * 100}%` }} /></div></li>)}</ul>}</section>
          <section aria-labelledby="h-pre" className="card"><h2 id="h-pre" className="mb-3 text-2xl">Precios del menú</h2>
            {!d.price ? <p>Sin datos de precios.</p> : <dl className="grid grid-cols-2 gap-2"><dt>Mínimo</dt><dd className="tabular-nums">{money(d.price.min)}</dd><dt>Máximo</dt><dd className="tabular-nums">{money(d.price.max)}</dd><dt>Promedio</dt><dd className="tabular-nums">{money(d.price.avg)}</dd></dl>}</section>
        </div>

        <section aria-labelledby="h-cmp" className="mb-8"><h2 id="h-cmp" className="mb-1 text-2xl">Comparación con la extracción anterior</h2>
          {!prev ? <p className="text-espresso/70">Se necesitan al menos dos extracciones para comparar.</p> : (<>
            <p className="mb-2 text-sm text-espresso/70">Anterior: {when(prev.executedAt)} · Actual: {when(cur.executedAt)}</p>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Cambios entre extracciones</caption>
              <thead><tr className="border-b border-espresso/30"><th scope="col" className="p-2">Elemento</th><th scope="col" className="p-2">Anterior</th><th scope="col" className="p-2">Actual</th><th scope="col" className="p-2">Cambio</th></tr></thead>
              <tbody>{STATS.map(([k, label]) => <tr key={k} className="border-b border-espresso/10"><th scope="row" className="p-2 font-semibold">{label}</th><td className="p-2 tabular-nums">{(prev[k] as number) ?? "—"}</td><td className="p-2 tabular-nums">{(cur[k] as number) ?? 0}</td><td className="p-2 tabular-nums">{delta((cur[k] as number) ?? 0, prev[k] as number | undefined)}</td></tr>)}</tbody></table></div></>)}
        </section>

        <section aria-labelledby="h-live" className="mb-8"><h2 id="h-live" className="mb-1 text-2xl">Sitio actual vs. lo que vio Selenium</h2>
          <p className="mb-2 text-sm text-espresso/70">Compara los datos en vivo de Firestore con lo detectado en la página. Una diferencia puede significar que el contenido cambió después de la extracción.</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Comparación Firestore y Selenium</caption>
            <thead><tr className="border-b border-espresso/30"><th scope="col" className="p-2">Elemento</th><th scope="col" className="p-2">Firestore ahora</th><th scope="col" className="p-2">Selenium</th><th scope="col" className="p-2">Resultado</th></tr></thead>
            <tbody>{compare.map(([label, l, s]) => <tr key={label} className="border-b border-espresso/10"><th scope="row" className="p-2 font-semibold">{label}</th><td className="p-2 tabular-nums">{l ?? "…"}</td><td className="p-2 tabular-nums">{s ?? "—"}</td><td className="p-2">{l === undefined || s === undefined ? "—" : <Badge value={l === s ? "success" : "pending"} label={l === s ? "Coincide" : "Difiere"} />}</td></tr>)}</tbody></table></div>
        </section>

        <section aria-labelledby="h-det" className="mb-8 space-y-2"><h2 id="h-det" className="text-2xl">Contenido detectado</h2>
          {[["Páginas visitadas", d.pages, (p: any) => `${p.status === "ok" ? "✓" : "✗"} ${p.path} · "${p.title}" · h2:${p.h2} h3:${p.h3} p:${p.paragraphs} enlaces:${p.links} img:${p.images} listas:${p.lists} tablas:${p.tables}${p.error ? ` · ${p.error}` : ""}`],
            ["Encabezados", d.headings, (h: any) => `${h.level} (${h.page}): ${h.text}`], ["Enlaces", d.links, (l: any) => `${l.text || "(sin texto)"} → ${l.href}`],
            ["Imágenes", d.images, (i: any) => `${i.alt === null ? "SIN ALT" : `alt="${i.alt}"`} · ${i.src}`], ["Tablas", d.tables, (t: any) => `${t.page}: ${t.rows} filas`], ["Metadatos (inicio)", d.meta, (m: any) => `${m.name}: ${m.content}`]]
            .map(([title, items, fmt]: any) => <details key={title} className="card"><summary className="cursor-pointer font-semibold">{title} ({items?.length ?? 0})</summary>{!items?.length ? <p className="mt-2 text-sm">No se detectaron elementos.</p> : <ul className="mt-2 max-h-72 list-disc overflow-auto pl-5 text-sm">{items.map((it: any, i: number) => <li key={i} className="break-all">{fmt(it)}</li>)}</ul>}</details>)}
        </section>

        <section aria-labelledby="h-his"><h2 id="h-his" className="mb-3 text-2xl">Historial de extracciones</h2>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">Historial</caption>
            <thead><tr className="border-b border-espresso/30">{["Fecha", "Estado", "Duración", "Páginas", "Productos", "Publicaciones", "Comentarios", "Imágenes", "Archivo", ""].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{data!.map((r, i) => <tr key={r.id} className={`border-b border-espresso/10 ${i === sel ? "bg-caramelo/10" : ""}`}><td className="p-2">{when(r.executedAt)}</td><td className="p-2"><Badge value={r.status} /></td><td className="p-2">{r.duration} s</td><td className="p-2">{r.pagesVisited}</td><td className="p-2">{r.productsFound}</td><td className="p-2">{r.postsFound}</td><td className="p-2">{r.commentsFound}</td><td className="p-2">{r.imagesFound}</td><td className="p-2">{r.outputFile || "—"}</td>
              <td className="p-2"><button className="btn-ghost !min-h-[36px]" aria-pressed={i === sel} onClick={() => setSel(i)}>{i === sel ? "Viendo" : "Ver detalle"}</button></td></tr>)}</tbody></table></div>
        </section>
      </>)}
    </>
  );
}
export default function AnalysisPage() { return <RequireRole roles={["admin"]}><Analysis /></RequireRole>; }

"use client";
import Link from "next/link";
import { limit, where } from "firebase/firestore";
import { useDocs } from "@/hooks/useDocs";
import { Spinner } from "@/components/ui";
import { money, today, byDateDesc } from "@/lib/utils/format";
import type { MenuItem, Promotion, Post } from "@/types";

export default function Home() {
  const menu = useDocs<MenuItem>("menu"), promos = useDocs<Promotion>("promotions"), posts = useDocs<Post>("posts", where("status", "==", "published"), limit(10));
  const barra = menu.data?.filter(m => m.available).slice(0, 6);
  const vigentes = promos.data?.filter(p => p.active && p.startDate <= today() && p.endDate >= today()).slice(0, 3);
  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <h1 className="text-5xl leading-tight md:text-6xl">Café &amp; Charla</h1>
          <p className="mt-4 max-w-md text-lg text-espresso/80">Granos tostados cada semana, pan de la mañana y una mesa larga donde la conversación es parte del menú.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Link href="/menu" className="btn-primary">Ver el menú</Link><Link href="/foro" className="btn-ghost">Entrar al foro</Link></div>
        </div>
        <aside aria-labelledby="barra" className="rotate-1 rounded-lg border-2 border-dashed border-espresso/40 bg-espuma p-6 shadow-sm">
          <h2 id="barra" className="text-2xl">Hoy en la barra</h2>
          {!barra ? <Spinner /> : barra.length === 0 ? <p className="mt-3">Estamos preparando el menú de hoy.</p> : (
            <ul className="mt-3">{barra.map(m => <li key={m.id} className="flex items-baseline justify-between gap-2 border-b border-dotted border-espresso/40 py-2"><span>{m.name} <span className="text-sm text-espresso/60">{m.size}</span></span><span className="tabular-nums font-semibold">{money(m.price)}</span></li>)}</ul>
          )}
        </aside>
      </section>

      <section aria-labelledby="h-promos">
        <div className="mb-4 flex items-end justify-between"><h2 id="h-promos" className="text-3xl">Promociones vigentes</h2><Link href="/promociones" className="underline">Ver todas</Link></div>
        {!vigentes ? <Spinner /> : vigentes.length === 0 ? <p>Por ahora no hay promociones activas.</p> : (
          <div className="grid gap-4 md:grid-cols-3">{vigentes.map(p => <article key={p.id} className="card"><p className="text-3xl font-display text-caramelo">{p.discount}% off</p><h3 className="mt-1 text-xl">{p.title}</h3><p className="mt-1 text-sm text-espresso/75">{p.description}</p></article>)}</div>
        )}
      </section>

      <section aria-labelledby="h-foro">
        <div className="mb-4 flex items-end justify-between"><h2 id="h-foro" className="text-3xl">Lo último en el foro</h2><Link href="/foro" className="underline">Ir al foro</Link></div>
        {!posts.data ? <Spinner /> : posts.data.length === 0 ? <p>Todavía no hay publicaciones. ¡Sé la primera persona en escribir!</p> : (
          <ul className="space-y-3">{[...posts.data].sort(byDateDesc).slice(0, 3).map(p => <li key={p.id} className="card"><Link href={`/foro/${p.id}`} className="font-display text-xl underline-offset-4 hover:underline">{p.title}</Link><p className="text-sm text-espresso/70">por {p.authorName}</p></li>)}</ul>
        )}
      </section>
    </div>
  );
}
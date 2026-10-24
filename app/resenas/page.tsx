"use client";
import Link from "next/link";
import { useState } from "react";
import { where } from "firebase/firestore";
import { apiFetch } from "@/lib/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { useAction } from "@/hooks/useAction";
import { useDocs } from "@/hooks/useDocs";
import { useDom } from "@/components/antibot/DomProvider";
import Captcha, { CaptchaValue } from "@/components/captcha/Captcha";
import { Empty, Field, PageHead, Spinner, Stars, Status } from "@/components/ui";
import { byDateDesc, fmtDate } from "@/lib/utils/format";
import { MSG, estadoResena, ultimoConsumo } from "@/lib/tickets/reglas";
import type { Claim, Review } from "@/types";

const seg = (t?: { seconds: number }) => (t ? t.seconds * 1000 : 0);

function Formulario({ productId, nombre, existente, onDone, onCancel }: { productId: string; nombre: string; existente: Review | null; onDone: () => void; onCancel: () => void }) {
  const a = useAction(), [rating, setRating] = useState(existente?.status === "deleted" ? 5 : existente?.rating ?? 5), [content, setContent] = useState(existente?.status === "deleted" ? "" : existente?.content ?? "");
  const [cap, setCap] = useState<CaptchaValue | null>(null), [reset, setReset] = useState(0);
  const actualizar = !!existente && existente.status !== "deleted";
  return (
    <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); a.run(async () => {
      if (!cap) throw new Error("Resuelve la verificación para continuar.");
      try {
        if (actualizar) await apiFetch(`/api/reviews/${existente!.id}`, { method: "PATCH", body: { rating, content, ...cap } });
        else await apiFetch("/api/reviews", { method: "POST", body: { productId, rating, content, ...cap } });
        onDone();
      } catch (err) { setReset(n => n + 1); throw err; }
    }); }}>
      <fieldset><legend className="mb-1 text-sm font-semibold">Calificación</legend>
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map(n => <label key={n} className={`flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md border text-lg ${rating === n ? "border-caramelo bg-caramelo/15" : "border-espresso/20"}`}><input type="radio" name={`rating-${productId}`} className="sr-only" checked={rating === n} onChange={() => setRating(n)} /><span aria-hidden>{n}★</span><span className="sr-only">{n} estrellas</span></label>)}</div></fieldset>
      <Field label={`Tu opinión sobre ${nombre}`} id={`c-${productId}`} hint="Entre 10 y 1000 caracteres."><textarea id={`c-${productId}`} className="input min-h-[110px]" required minLength={10} maxLength={1000} value={content} onChange={e => setContent(e.target.value)} /></Field>
      <Captcha kind="select" onChange={setCap} resetKey={reset} />
      <Status error={a.error} />
      <div className="flex gap-2"><button className="btn-primary" disabled={a.busy}>{a.busy ? "Guardando…" : actualizar ? "Actualizar reseña" : "Publicar reseña"}</button><button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button></div>
    </form>
  );
}

function MisProductos({ onChange }: { onChange: () => void }) {
  const { user } = useAuth(), a = useAction();
  const claims = useDocs<Claim>("ticket_claims", where("userId", "==", user!.uid)), mias = useDocs<Review>("reviews", where("authorId", "==", user!.uid));
  const [abierto, setAbierto] = useState("");
  if (claims.error || mias.error) return <Status error="No pudimos cargar tus consumos. Inténtalo de nuevo." />;
  if (!claims.data || !mias.data) return <Spinner />;
  const consumos = claims.data.flatMap(c => c.items.map(i => ({ productId: i.productId, nombre: i.name, consumidoMs: seg(c.consumedAt) })));
  const productos = Array.from(new Map(consumos.map(c => [c.productId, c.nombre] as [string, string])).entries());
  if (productos.length === 0) return <div className="card"><p>Para reseñar un producto necesitas un <strong>ticket de consumo</strong>. Pídelo a tu mesero y canjéalo.</p><Link href="/canjear" className="btn-primary mt-3">Canjear ticket</Link></div>;
  const terminado = () => { setAbierto(""); claims.reload(); mias.reload(); onChange(); };
  return (
    <ul className="space-y-3">{productos.map(([pid, nombre]) => {
      const rev = mias.data!.find(r => r.productId === pid) ?? null;
      const est = estadoResena(ultimoConsumo(consumos, pid), rev ? { status: rev.status, lastReviewedMs: seg(rev.lastReviewedAt ?? rev.createdAt) } : null);
      const eliminada = rev?.status === "deleted";
      return (
        <li key={pid} className="card">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xl">{nombre}</h3>{rev && !eliminada && <Stars value={rev.rating} />}</div>
          {rev && !eliminada && <p className="mt-1 text-sm">{rev.content}</p>}
          {est === "puede_publicar" && <p className="mt-1 text-sm">{eliminada ? "Eliminaste tu reseña anterior; ya puedes publicar una nueva." : "Consumiste este producto y aún no lo has reseñado."}</p>}
          {est === "puede_actualizar" && <p className="mt-1 text-sm text-musgo">Tienes un consumo posterior a tu reseña: puedes actualizarla.</p>}
          {est === "bloqueada" && <p className="mt-1 text-sm text-espresso/70">{rev?.status === "hidden" ? "Tu reseña fue ocultada por moderación." : MSG.volverConsumir}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {(est === "puede_publicar" || est === "puede_actualizar") && abierto !== pid && <button className="btn-primary !min-h-[36px]" onClick={() => setAbierto(pid)}>{est === "puede_publicar" ? "Escribir reseña" : "Actualizar reseña"}</button>}
            {rev && !eliminada && <button className="btn-ghost !min-h-[36px]" disabled={a.busy} onClick={() => window.confirm("¿Eliminar tu reseña? Para publicar otra necesitarás un nuevo consumo.") && a.run(async () => { await apiFetch(`/api/reviews/${rev.id}`, { method: "DELETE" }); terminado(); })}>Eliminar</button>}
          </div>
          {abierto === pid && <Formulario productId={pid} nombre={nombre} existente={rev} onDone={terminado} onCancel={() => setAbierto("")} />}
        </li>);
    })}<li><Status error={a.error} /></li></ul>
  );
}

export default function ReviewsPage() {
  const { user, loading } = useAuth(), { data, error, reload } = useDocs<Review>("reviews", where("status", "==", "published")), h = useDom();
  return (
    <>
      <PageHead title="Reseñas" lead="Solo reseñan quienes consumieron el producto: canjea el ticket que te da tu mesero." action={user ? <Link href="/mis-consumos" className="btn-ghost">Mis consumos</Link> : undefined} />
      <section aria-labelledby="h-mis" className="mb-10">
        <h2 id="h-mis" className="mb-3 text-2xl">Tus productos consumidos</h2>
        {user ? <MisProductos onChange={reload} /> : !loading && <p className="card"><Link href="/login?next=/resenas" className="underline">Inicia sesión</Link> y canjea tu ticket para reseñar lo que consumiste.</p>}
      </section>
      <h2 className="mb-3 text-2xl">Opiniones de la comunidad</h2>
      <Status error={error} />
      {!data && !error ? <Spinner /> : data && data.length === 0 ? <Empty title="Aún no hay reseñas">Canjea tu ticket y cuéntanos qué tal estuvo tu visita.</Empty> : (
        <ul className="grid gap-4 md:grid-cols-2">{[...(data ?? [])].sort(byDateDesc).map(r => <li key={r.id} {...h("review-item")} className="card"><p><span {...h("review-rating")}><Stars value={r.rating} /></span> <span className="font-semibold">{r.product}</span></p><p className="mt-2">{r.content}</p><p className="mt-2 text-sm text-espresso/60">{r.authorName} · {fmtDate(r.createdAt)}</p></li>)}</ul>
      )}
    </>
  );
}
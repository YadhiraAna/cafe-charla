"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { doc, getDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { useAction } from "@/hooks/useAction";
import { useDocs } from "@/hooks/useDocs";
import Captcha, { CaptchaValue } from "@/components/captcha/Captcha";
import { Empty, Field, PageHead, Spinner, Stars, Status } from "@/components/ui";
import { byDateDesc, fmtDate } from "@/lib/utils/format";
import { useDom } from "@/components/antibot/DomProvider";
import type { Review } from "@/types";

function ReviewForm({ mine, onDone }: { mine: Review | null; onDone: () => void }) {
  const a = useAction(), [rating, setRating] = useState(mine?.rating ?? 5), [product, setProduct] = useState(mine?.product ?? ""), [content, setContent] = useState(mine?.content ?? "");
  const [cap, setCap] = useState<CaptchaValue | null>(null), [reset, setReset] = useState(0);
  return (
    <form className="card space-y-4" onSubmit={e => { e.preventDefault(); a.run(async () => {
      if (mine) { await apiFetch(`/api/reviews/${mine.id}`, { method: "PATCH", body: { rating, product, content } }); onDone(); return "Reseña actualizada."; }
      if (!cap) throw new Error("Resuelve la verificación para continuar.");
      try { await apiFetch("/api/reviews", { method: "POST", body: { rating, product, content, ...cap } }); onDone(); return "¡Gracias por tu reseña!"; }
      catch (err) { setReset(n => n + 1); throw err; }
    }); }}>
      <h2 className="text-2xl">{mine ? "Editar mi reseña" : "Escribe tu reseña"}</h2>
      <fieldset><legend className="mb-1 text-sm font-semibold">Calificación</legend>
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map(n => <label key={n} className={`flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md border text-lg ${rating === n ? "border-caramelo bg-caramelo/15" : "border-espresso/20"}`}><input type="radio" name="rating" className="sr-only" checked={rating === n} onChange={() => setRating(n)} /><span aria-hidden>{n}★</span><span className="sr-only">{n} estrellas</span></label>)}</div>
      </fieldset>
      <Field label="Producto" id="product"><input id="product" className="input" required minLength={2} maxLength={80} value={product} onChange={e => setProduct(e.target.value)} /></Field>
      <Field label="Tu opinión" id="rcontent" hint="Entre 10 y 1000 caracteres."><textarea id="rcontent" className="input min-h-[120px]" required minLength={10} maxLength={1000} value={content} onChange={e => setContent(e.target.value)} /></Field>
      {!mine && <Captcha kind="select" onChange={setCap} resetKey={reset} />}
      <Status error={a.error} done={a.done} />
      <button className="btn-primary" disabled={a.busy}>{a.busy ? "Guardando…" : mine ? "Guardar cambios" : "Publicar reseña"}</button>
    </form>
  );
}

export default function ReviewsPage() {
  const { user, loading } = useAuth(), a = useAction(), { data, error, reload } = useDocs<Review>("reviews", where("status", "==", "published")), h = useDom();
  const [mine, setMine] = useState<Review | null>(null), [editing, setEditing] = useState(false), [mineLoaded, setMineLoaded] = useState(false);
  const loadMine = async () => { if (!user) { setMine(null); return setMineLoaded(true); } try { const s = await getDoc(doc(db, "reviews", user.uid)); setMine(s.exists() ? ({ id: s.id, ...s.data() } as Review) : null); } catch { setMine(null); } setMineLoaded(true); };
  useEffect(() => { if (!loading) loadMine(); /* eslint-disable-next-line */ }, [user, loading]);
  const refresh = async () => { setEditing(false); await loadMine(); reload(); };

  return (
    <>
      <PageHead title="Reseñas" lead="Lo que opina la gente que ya pasó por la barra." />
      <div className="mb-8">
        {!user && !loading ? <p className="card"><Link href="/login?next=/resenas" className="underline">Inicia sesión</Link> para dejar tu reseña.</p>
          : !mineLoaded ? <Spinner /> : !mine || editing ? <ReviewForm mine={editing ? mine : null} onDone={refresh} /> : (
            <div className="card space-y-2"><h2 className="text-2xl">Tu reseña</h2><p><Stars value={mine.rating} /> {mine.product}</p><p>{mine.content}</p><p className="text-xs text-espresso/60">Estado: {({ published: "Publicada", pending: "Pendiente", hidden: "Oculta" } as any)[mine.status]}</p>
              <div className="flex gap-2">{["published", "pending"].includes(mine.status) && <button className="btn-ghost" onClick={() => setEditing(true)}>Editar</button>}
                <button className="btn-danger" onClick={() => window.confirm("¿Eliminar tu reseña?") && a.run(async () => { await apiFetch(`/api/reviews/${mine.id}`, { method: "DELETE" }); await refresh(); return "Reseña eliminada."; })}>Eliminar</button></div>
              <Status error={a.error} done={a.done} /></div>
          )}
      </div>
      <Status error={error} />
      {!data && !error ? <Spinner /> : data && data.length === 0 ? <Empty title="Aún no hay reseñas">Cuéntanos qué tal estuvo tu visita.</Empty> : (
        <ul className="grid gap-4 md:grid-cols-2">{[...(data ?? [])].sort(byDateDesc).map(r => <li key={r.id} {...h("review-item")} className="card"><p><span {...h("review-rating")}><Stars value={r.rating} /></span> <span className="font-semibold">{r.product}</span></p><p className="mt-2">{r.content}</p><p className="mt-2 text-sm text-espresso/60">{r.authorName} · {fmtDate(r.createdAt)}</p></li>)}</ul>
      )}
    </>
  );
}

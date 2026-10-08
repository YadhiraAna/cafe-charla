"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { useAction } from "@/hooks/useAction";
import Captcha, { CaptchaValue } from "@/components/captcha/Captcha";
import { Empty, Field, Spinner, Status } from "@/components/ui";
import { fmtDate } from "@/lib/utils/format";
import { useDom } from "@/components/antibot/DomProvider";
import type { Comment, Post } from "@/types";

export default function PostPage() {
  const { id } = useParams<{ id: string }>(), router = useRouter(), { user, profile } = useAuth(), a = useAction(), h = useDom();
  const [post, setPost] = useState<Post | null | undefined>(undefined), [comments, setComments] = useState<Comment[]>([]);
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(""), [content, setContent] = useState("");
  const [text, setText] = useState(""), [cap, setCap] = useState<CaptchaValue | null>(null), [reset, setReset] = useState(0);
  const [editId, setEditId] = useState(""), [editText, setEditText] = useState("");
  const isMod = profile?.role === "moderator" || profile?.role === "admin";

  const load = useCallback(async () => {
    try {
      const s = await getDoc(doc(db, "posts", id));
      if (!s.exists()) return setPost(null);
      const p = { id: s.id, ...s.data() } as Post; setPost(p); setTitle(p.title); setContent(p.content);
      const c = await getDocs(query(collection(db, "comments"), where("postId", "==", id), where("status", "==", "published")));
      setComments(c.docs.map(d => ({ id: d.id, ...d.data() }) as Comment).sort((x, y) => (x.createdAt?.seconds ?? 0) - (y.createdAt?.seconds ?? 0)));
    } catch { setPost(null); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (post === undefined) return <Spinner />;
  if (post === null) return <Empty title="Publicación no encontrada">Puede que haya sido eliminada o no esté disponible. <Link href="/foro" className="underline">Volver al foro</Link></Empty>;

  const own = user?.uid === post.authorId;
  const del = (path: string, msg: string, after: () => void) => { if (window.confirm(msg)) a.run(async () => { await apiFetch(path, { method: "DELETE" }); after(); }); };

  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-3">
        {editing ? (
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); a.run(async () => { await apiFetch(`/api/posts/${id}`, { method: "PATCH", body: { title, content } }); setEditing(false); await load(); return "Publicación actualizada."; }); }}>
            <Field label="Título" id="t"><input id="t" className="input" required minLength={3} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></Field>
            <Field label="Contenido" id="c"><textarea id="c" className="input min-h-[140px]" required minLength={10} maxLength={5000} value={content} onChange={e => setContent(e.target.value)} /></Field>
            <div className="flex gap-2"><button className="btn-primary" disabled={a.busy}>Guardar</button><button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancelar</button></div>
          </form>
        ) : (<>
          <h1 className="text-4xl">{post.title}</h1>
          <p className="text-sm text-espresso/60">por {post.authorName} · {fmtDate(post.createdAt)}</p>
          {post.imageUrl && <img src={post.imageUrl} alt={`Imagen de la publicación: ${post.title}`} className="max-h-96 w-full rounded-md object-cover" />}
          <p className="whitespace-pre-wrap text-lg leading-relaxed">{post.content}</p>
          <div className="flex gap-2">
            {own && <button className="btn-ghost" onClick={() => setEditing(true)}>Editar</button>}
            {(own || isMod) && <button className="btn-danger" onClick={() => del(`/api/posts/${id}`, "¿Eliminar esta publicación y sus comentarios?", () => router.push("/foro"))}>Eliminar</button>}
          </div>
        </>)}
        <Status error={a.error} done={a.done} />
      </div>

      <section aria-labelledby="h-com" className="space-y-4">
        <h2 id="h-com" {...h("comments-heading")} className="text-2xl">Comentarios ({comments.length})</h2>
        {comments.length === 0 && <p>Todavía no hay comentarios.</p>}
        <ul className="space-y-3">
          {comments.map(c => (
            <li key={c.id} className="card">
              <p className="text-sm text-espresso/60">{c.authorName} · {fmtDate(c.createdAt)}</p>
              {editId === c.id ? (
                <form className="mt-2 space-y-2" onSubmit={e => { e.preventDefault(); a.run(async () => { await apiFetch(`/api/comments/${c.id}`, { method: "PATCH", body: { content: editText } }); setEditId(""); await load(); }); }}>
                  <label htmlFor={`e-${c.id}`} className="sr-only">Editar comentario</label>
                  <textarea id={`e-${c.id}`} className="input" required maxLength={1000} value={editText} onChange={e => setEditText(e.target.value)} />
                  <div className="flex gap-2"><button className="btn-primary" disabled={a.busy}>Guardar</button><button type="button" className="btn-ghost" onClick={() => setEditId("")}>Cancelar</button></div>
                </form>
              ) : (<>
                <p className="mt-1 whitespace-pre-wrap">{c.content}</p>
                <div className="mt-2 flex gap-2">
                  {user?.uid === c.authorId && <button className="btn-ghost" onClick={() => { setEditId(c.id); setEditText(c.content); }}>Editar</button>}
                  {(user?.uid === c.authorId || isMod) && <button className="btn-danger" onClick={() => del(`/api/comments/${c.id}`, "¿Eliminar este comentario?", load)}>Eliminar</button>}
                </div>
              </>)}
            </li>
          ))}
        </ul>

        {user ? (
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); a.run(async () => {
            if (!cap) throw new Error("Resuelve la verificación para continuar.");
            try { await apiFetch("/api/comments", { method: "POST", body: { postId: id, content: text, ...cap } }); setText(""); setReset(n => n + 1); await load(); return "Comentario publicado."; }
            catch (err) { setReset(n => n + 1); throw err; }
          }); }}>
            <Field label="Escribe un comentario" id="new-comment"><textarea id="new-comment" className="input min-h-[100px]" required maxLength={1000} value={text} onChange={e => setText(e.target.value)} /></Field>
            <Captcha kind="question" onChange={setCap} resetKey={reset} />
            <button className="btn-primary" disabled={a.busy}>{a.busy ? "Enviando…" : "Comentar"}</button>
          </form>
        ) : <p><Link href={`/login?next=/foro/${id}`} className="underline">Inicia sesión</Link> para comentar.</p>}
      </section>
    </article>
  );
}

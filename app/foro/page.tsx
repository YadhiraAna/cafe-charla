"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, getCountFromServer, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDocs } from "@/hooks/useDocs";
import { useTieneTicket } from "@/hooks/useTieneTicket";
import { Empty, PageHead, Spinner, Status } from "@/components/ui";
import { byDateDesc, fmtDate } from "@/lib/utils/format";
import { useDom } from "@/components/antibot/DomProvider";
import type { Post } from "@/types";

function PostCard({ p }: { p: Post }) {
  const [n, setN] = useState<number | null>(null), h = useDom();
  useEffect(() => { getCountFromServer(query(collection(db, "comments"), where("postId", "==", p.id), where("status", "==", "published"))).then(s => setN(s.data().count)).catch(() => setN(0)); }, [p.id]);
  return (
    <li {...h("post-item")} className="card flex gap-4">
      {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" className="hidden h-24 w-24 shrink-0 rounded-md object-cover sm:block" />}
      <div className="min-w-0">
        <h2 className="text-2xl"><Link href={`/foro/${p.id}`} {...h("post-link")} className="hover:underline">{p.title}</Link></h2>
        <p {...h("post-meta")} className="text-sm text-espresso/60">por {p.authorName} · {fmtDate(p.createdAt)} · {n ?? "…"} comentarios</p>
        <p className="mt-2 line-clamp-2 text-espresso/80">{p.content}</p>
      </div>
    </li>
  );
}

export default function ForumPage() {
  const { user } = useAuth(), { data, error } = useDocs<Post>("posts", where("status", "==", "published"), limit(30)), { tiene, cargando } = useTieneTicket();
  return (
    <>
      <PageHead title="Foro" lead="Conversaciones de la comunidad de Café & Charla." action={!user ? <Link href="/login?next=/foro/nueva" className="btn-primary">Inicia sesión para publicar</Link> : cargando ? undefined : tiene ? <Link href="/foro/nueva" className="btn-primary">Nueva publicación</Link> : <Link href="/canjear" className="btn-ghost">Canjea un ticket para participar</Link>} />
      <Status error={error} />
      {!data && !error ? <Spinner /> : data && data.length === 0 ? <Empty title="Aún no hay publicaciones">Inicia la primera conversación.</Empty> : <ul className="space-y-4">{[...(data ?? [])].sort(byDateDesc).map(p => <PostCard key={p.id} p={p} />)}</ul>}
    </>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import RequireRole from "@/components/auth/RequireRole";
import Captcha, { CaptchaValue } from "@/components/captcha/Captcha";
import ImageUpload, { Uploaded } from "@/components/forum/ImageUpload";
import { Field, PageHead, Spinner, Status } from "@/components/ui";
import AvisoTicket from "@/components/forum/AvisoTicket";
import { useTieneTicket } from "@/hooks/useTieneTicket";

function NewPost() {
  const router = useRouter(), a = useAction();
  const [title, setTitle] = useState(""), [content, setContent] = useState(""), [img, setImg] = useState<Uploaded | null>(null), [cap, setCap] = useState<CaptchaValue | null>(null), [reset, setReset] = useState(0);
  return (
    <form className="mx-auto max-w-2xl space-y-4" onSubmit={e => { e.preventDefault(); a.run(async () => {
      if (!cap) throw new Error("Resuelve la verificación para continuar.");
      try {
        const r = await apiFetch<{ id: string }>("/api/posts", { method: "POST", body: { title, content, imageUrl: img?.imageUrl ?? "", imagePublicId: img?.publicId ?? "", ...cap } });
        router.push(`/foro/${r.id}`);
      } catch (err) { setReset(n => n + 1); throw err; }
    }); }}>
      <PageHead title="Nueva publicación" />
      <Field label="Título" id="title" hint="Entre 3 y 120 caracteres."><input id="title" className="input" required minLength={3} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></Field>
      <Field label="Contenido" id="content" hint="Entre 10 y 5000 caracteres. Se muestra como texto plano."><textarea id="content" className="input min-h-[160px]" required minLength={10} maxLength={5000} value={content} onChange={e => setContent(e.target.value)} /></Field>
      <ImageUpload purpose="post" onUploaded={setImg} />
      <Captcha kind="images" onChange={setCap} resetKey={reset} />
      <Status error={a.error} />
      <button className="btn-primary" disabled={a.busy}>{a.busy ? "Publicando…" : "Publicar"}</button>
    </form>
  );
}

function ConTicket() {  
  const { cargando, tiene } = useTieneTicket();  
  if (cargando) return <Spinner />;  
  return tiene ? <NewPost /> : <><PageHead title="Nueva publicación" /><AvisoTicket /></>;
}

export default function NewPostPage() { 
  return <RequireRole><ConTicket /></RequireRole>; 
}
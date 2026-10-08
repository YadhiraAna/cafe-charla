"use client";
/** Sube la imagen a /api/upload (Cloudinary vía servidor). Valida tipo y tamaño también en el navegador. */
import { useState } from "react";
import { apiFetch } from "@/lib/utils/api";
import { Status } from "@/components/ui";

export interface Uploaded { imageUrl: string; publicId: string }
export default function ImageUpload({ purpose, onUploaded, label = "Imagen (opcional)" }: { purpose: "profile" | "post" | "menu" | "promo"; onUploaded: (u: Uploaded | null) => void; label?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [preview, setPreview] = useState("");
  async function pick(file?: File) {
    setError(""); if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError("Solo se permiten JPG, PNG o WEBP.");
    if (file.size > 2 * 1024 * 1024) return setError("La imagen debe pesar máximo 2 MB.");
    setBusy(true);
    try { const fd = new FormData(); fd.append("file", file); fd.append("purpose", purpose); const r = await apiFetch<Uploaded>("/api/upload", { method: "POST", body: fd }); setPreview(r.imageUrl); onUploaded(r); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <label htmlFor={`img-${purpose}`} className="block text-sm font-semibold">{label}</label>
      <input id={`img-${purpose}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => pick(e.target.files?.[0])} className="block text-sm" />
      <p className="text-xs text-espresso/60">JPG, PNG o WEBP, máximo 2 MB.</p>
      {busy && <p role="status" className="text-sm">Subiendo imagen…</p>}
      {preview && <><img src={preview} alt="Vista previa de la imagen subida" className="h-32 rounded-md object-cover" /><button type="button" className="text-sm underline" onClick={() => { setPreview(""); onUploaded(null); }}>Quitar imagen</button></>}
      <Status error={error} />
    </div>
  );
}

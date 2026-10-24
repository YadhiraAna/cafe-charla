"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { useAction } from "@/hooks/useAction";
import RequireRole from "@/components/auth/RequireRole";
import ImageUpload, { Uploaded } from "@/components/forum/ImageUpload";
import { Field, PageHead, Status } from "@/components/ui";
import { fmtDate } from "@/lib/utils/format";

function ProfileForm() {
  const { profile, refreshProfile, logout } = useAuth(), a = useAction();
  const [name, setName] = useState(profile!.name), [photo, setPhoto] = useState<Uploaded | null>(null);
  const ROLE = { user: "Usuario", moderator: "Moderador", admin: "Administrador", waiter: "Mesero" }[profile!.role];
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHead title="Mi perfil" />
      <div className="card flex items-center gap-4">
        {profile!.photoURL ? <img src={profile!.photoURL} alt="Tu foto de perfil" className="h-20 w-20 rounded-full object-cover" /> : <div aria-hidden className="flex h-20 w-20 items-center justify-center rounded-full bg-caramelo text-3xl text-espuma">{profile!.name[0]}</div>}
        <dl className="text-sm"><dt className="sr-only">Correo</dt><dd>{profile!.email}</dd><dt className="sr-only">Rol</dt><dd>Rol: {ROLE}</dd><dt className="sr-only">Miembro desde</dt><dd>Miembro desde {fmtDate(profile!.createdAt)}</dd></dl>
      </div>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); a.run(async () => {
        await apiFetch("/api/users/me", { method: "PATCH", body: { name, ...(photo && { photoURL: photo.imageUrl, photoPublicId: photo.publicId }) } });
        await refreshProfile(); setPhoto(null); return "Perfil actualizado.";
      }); }}>
        <Field label="Nombre" id="name"><input id="name" className="input" required minLength={2} maxLength={60} value={name} onChange={e => setName(e.target.value)} /></Field>
        <ImageUpload purpose="profile" label="Cambiar foto de perfil" onUploaded={setPhoto} />
        <Status error={a.error} done={a.done} />
        <button className="btn-primary" disabled={a.busy}>{a.busy ? "Guardando…" : "Guardar cambios"}</button>
      </form>
      <button className="btn-ghost" onClick={logout}>Cerrar sesión</button>
    </div>
  );
}
export default function ProfilePage() { return <RequireRole><ProfileForm /></RequireRole>; }

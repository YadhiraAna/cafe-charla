"use client";
import { orderBy } from "firebase/firestore";
import { apiFetch } from "@/lib/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { useAction } from "@/hooks/useAction";
import { useDocs } from "@/hooks/useDocs";
import RequireRole from "@/components/auth/RequireRole";
import Badge from "@/components/admin/Badge";
import { Empty, PageHead, Spinner, Status } from "@/components/ui";
import { fmtDate } from "@/lib/utils/format";
import type { Profile } from "@/types";

function Users() {
  const { user } = useAuth(), a = useAction(), { data, error, reload } = useDocs<Profile>("users", orderBy("createdAt", "desc"));
  const patch = (u: Profile, body: object, msg: string) => window.confirm(msg) && a.run(async () => { await apiFetch(`/api/admin/users/${u.uid}`, { method: "PATCH", body }); reload(); return "Cambios guardados."; });
  return (
    <>
      <PageHead title="Usuarios" lead="Asigna roles y activa o desactiva cuentas. No puedes modificar tu propia cuenta." />
      <Status error={error || a.error} done={a.done} />
      {!data && !error ? <Spinner /> : data?.length === 0 ? <Empty title="No hay usuarios" /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Usuarios registrados</caption>
          <thead><tr className="border-b border-espresso/30"><th scope="col" className="p-2">Nombre</th><th scope="col" className="p-2">Correo</th><th scope="col" className="p-2">Rol</th><th scope="col" className="p-2">Estado</th><th scope="col" className="p-2">Alta</th><th scope="col" className="p-2">Acciones</th></tr></thead>
          <tbody>{data?.map(u => { const self = u.uid === user?.uid; return (
            <tr key={u.uid} className="border-b border-espresso/10">
              <td className="p-2 font-semibold">{u.name}{self && " (tú)"}</td><td className="p-2">{u.email}</td>
              <td className="p-2"><select aria-label={`Rol de ${u.name}`} className="input !min-h-[36px] !w-auto" value={u.role} disabled={self || a.busy} onChange={e => patch(u, { role: e.target.value }, `¿Cambiar el rol de ${u.name} a "${e.target.value}"?`)}><option value="user">Usuario</option><option value="moderator">Moderador</option><option value="admin">Administrador</option><option value="waiter">Cajero</option></select></td>
              <td className="p-2"><Badge value={u.status} /></td><td className="p-2">{fmtDate(u.createdAt)}</td>
              <td className="p-2"><button className="btn-ghost !min-h-[36px]" disabled={self || a.busy} onClick={() => patch(u, { status: u.status === "active" ? "disabled" : "active" }, `¿${u.status === "active" ? "Desactivar" : "Activar"} la cuenta de ${u.name}?`)}>{u.status === "active" ? "Desactivar" : "Activar"}</button></td>
            </tr>); })}</tbody>
      </table></div>)}
    </>
  );
}
export default function UsersPage() { return <RequireRole roles={["admin"]}><Users /></RequireRole>; }

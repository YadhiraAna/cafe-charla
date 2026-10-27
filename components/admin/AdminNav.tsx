"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

/** ÚNICO menú del panel de administración (se eliminó la barra duplicada del encabezado y la sección Análisis). El moderador solo ve Moderación. */
export default function AdminNav() {
  const { profile } = useAuth(), path = usePathname();
  const links = profile?.role === "admin"
    ? [["/admin", "Panel"], ["/admin/usuarios", "Usuarios"], ["/admin/moderacion", "Moderación"], ["/admin/menu", "Menú"], ["/admin/promociones", "Promociones"], ["/admin/tickets", "Tickets"], ["/admin/logs", "Logs"], ["/admin/seguridad", "Seguridad"]]
    : [["/admin/moderacion", "Moderación"]];
  const activo = (h: string) => path === h || (h === "/admin/seguridad" && path === "/admin/actividad"); // Actividad es una pestaña de Seguridad
  return (
    <nav aria-label="Secciones del panel" className="mb-8 flex flex-wrap gap-2">
      {links.map(([h, l]) => <Link key={h} href={h} aria-current={activo(h) ? "page" : undefined} className={`btn border text-sm ${activo(h) ? "border-espresso bg-espresso text-espuma" : "border-espresso/30"}`}>{l}</Link>)}
    </nav>
  );
}
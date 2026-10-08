"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

/** Sub-navegación del panel. El moderador solo ve Moderación. */
export default function AdminNav() {
  const { profile } = useAuth(), path = usePathname();
  const links = profile?.role === "admin"
    ? [["/admin", "Panel"], ["/admin/usuarios", "Usuarios"], ["/admin/moderacion", "Moderación"], ["/admin/menu", "Menú"], ["/admin/promociones", "Promociones"], ["/admin/logs", "Logs"], ["/admin/analisis", "Análisis"], ["/admin/seguridad", "Seguridad"]]
    : [["/admin/moderacion", "Moderación"]];
  return (
    <nav aria-label="Secciones del panel" className="mb-8 flex flex-wrap gap-2">
      {links.map(([h, l]) => <Link key={h} href={h} aria-current={path === h ? "page" : undefined} className={`btn border text-sm ${path === h ? "border-espresso bg-espresso text-espuma" : "border-espresso/30"}`}>{l}</Link>)}
    </nav>
  );
}

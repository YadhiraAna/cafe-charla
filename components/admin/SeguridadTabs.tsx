"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [["/admin/seguridad", "Alertas y falsos positivos"], ["/admin/actividad", "Actividad y técnicas"]];
/** Dos vistas de la MISMA sección "Seguridad" (leen la misma colección con distinto propósito). */
export default function SeguridadTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Vistas de seguridad" className="mb-6 flex flex-wrap gap-2 border-b border-espresso/20">
      {TABS.map(([h, l]) => <Link key={h} href={h} aria-current={path === h ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm ${path === h ? "border-caramelo font-semibold" : "border-transparent hover:border-espresso/30"}`}>{l}</Link>)}
    </nav>
  );
}
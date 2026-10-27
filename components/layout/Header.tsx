"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const PUBLIC = [["/", "Inicio"], ["/menu", "Menú"], ["/promociones", "Promociones"], ["/foro", "Foro"], ["/resenas", "Reseñas"], ["/nosotros", "Nosotros"], ["/ubicacion", "Ubicación"], ["/contacto", "Contacto"]];

export default function Header() {
  const { user, profile, loading, logout } = useAuth();
  const path = usePathname(), [open, setOpen] = useState(false);
  const role = profile?.role;
  const link = (href: string, label: string) => (
    <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={path === href ? "page" : undefined}
      className={`rounded px-2 py-2 text-sm hover:text-caramelo ${path === href ? "font-bold underline decoration-caramelo decoration-2 underline-offset-8" : ""}`}>{label}</Link>
  );
  return (
    <header className="no-print border-b border-espresso/15 bg-espuma">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-display text-2xl">Café &amp; Charla</Link>
        <button className="btn-ghost lg:hidden" aria-expanded={open} aria-controls="nav" onClick={() => setOpen(!open)}>{open ? "Cerrar menú" : "Menú"}</button>
        <div id="nav" className={`${open ? "flex" : "hidden"} w-full flex-col gap-2 lg:flex lg:w-auto lg:flex-row lg:items-center lg:gap-4`}>
          <nav aria-label="Principal" className="flex flex-col lg:flex-row lg:gap-1">{PUBLIC.map(([h, l]) => link(h, l))}</nav>
          <div className="flex flex-wrap items-center gap-2">
            {loading ? null : user ? (<>
              {role === "admin" && link("/admin", "Administración")}
              {role === "moderator" && link("/admin/moderacion", "Moderación")}
              {role === "waiter" && link("/cajero", "Cajero")}
              {link("/canjear", "Canjear ticket")}
              {link("/mis-consumos", "Mis consumos")}
              {link("/perfil", "Perfil")}
              <button className="btn-ghost" onClick={async () => { await logout(); setOpen(false); }}>Cerrar sesión</button>
            </>) : (<>
              <Link href="/login" className="btn-ghost" onClick={() => setOpen(false)}>Iniciar sesión</Link>
              <Link href="/registro" className="btn-primary" onClick={() => setOpen(false)}>Registrarse</Link>
            </>)}
          </div>
        </div>
      </div>
    </header>
  );
}
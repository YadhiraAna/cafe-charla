"use client";
/** Protección de rutas en el cliente (UX). La seguridad real la imponen las APIs y las reglas de Firestore. */
import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui";
import type { Role } from "@/types";

export default function RequireRole({ roles = ["user", "moderator", "admin", "waiter"], children }: { roles?: Role[]; children: ReactNode }) {
  const { user, profile, loading } = useAuth(), router = useRouter(), path = usePathname();
  const allowed = !!profile && profile.status === "active" && roles.includes(profile.role);
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(path + window.location.search)}`);
    else if (!allowed) router.replace("/acceso-denegado");
  }, [loading, user, allowed, router, path]);
  return allowed ? <>{children}</> : <Spinner label="Verificando acceso…" />;
}

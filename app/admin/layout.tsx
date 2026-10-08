"use client";
import RequireRole from "@/components/auth/RequireRole";
import AdminNav from "@/components/admin/AdminNav";

/** Todo /admin exige moderador o admin. Cada página restringe más (admin) cuando corresponde; la API vuelve a verificarlo. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["moderator", "admin"]}><AdminNav />{children}</RequireRole>;
}

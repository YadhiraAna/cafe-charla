"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import RequireRole from "@/components/auth/RequireRole";
import Captcha, { CaptchaValue } from "@/components/captcha/Captcha";
import { Field, PageHead, Status } from "@/components/ui";

interface Canjeado { code: string; items: { name: string }[]; consumedAtMs: number; people: number; uses: number; maxUses: number }

function Canjear() {
  const params = useSearchParams(), a = useAction();
  const [codigo, setCodigo] = useState((params.get("codigo") ?? "").toUpperCase().slice(0, 20));
  const [cap, setCap] = useState<CaptchaValue | null>(null), [reset, setReset] = useState(0), [listo, setListo] = useState<Canjeado | null>(null);

  if (listo) return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHead title="¡Ticket asociado!" />
      <div className="card space-y-2" role="status">
        <p>Ticket <strong>{listo.code}</strong> · {new Date(listo.consumedAtMs).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</p>
        <p className="text-sm">Ya puedes reseñar estos productos:</p>
        <ul className="list-disc pl-5">{listo.items.map((i, k) => <li key={k}>{i.name}</li>)}</ul>
        <p className="text-xs text-espresso/70">Participantes: {listo.uses} de {listo.maxUses}</p>
      </div>
      <div className="flex flex-wrap gap-2"><Link href="/resenas" className="btn-primary">Escribir reseñas</Link><Link href="/mis-consumos" className="btn-ghost">Ver mis consumos</Link></div>
    </div>
  );
  return (
    <form className="mx-auto max-w-md space-y-4" onSubmit={e => { e.preventDefault(); a.run(async () => {
      if (!cap) throw new Error("Resuelve la verificación para continuar.");
      try { setListo(await apiFetch<Canjeado>("/api/tickets/canjear", { method: "POST", body: { codigo, ...cap } })); }
      catch (err) { setReset(n => n + 1); throw err; }
    }); }}>
      <PageHead title="Canjear ticket" lead="Escribe el código de tu ticket (o escanea su QR) para habilitar tus reseñas." />
      <Field label="Código del ticket" id="codigo" hint="Ejemplo: CAFE-X92A6K"><input id="codigo" className="input uppercase tracking-widest" required maxLength={20} autoComplete="off" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} /></Field>
      <Captcha kind="math" onChange={setCap} resetKey={reset} />
      <Status error={a.error} />
      <button className="btn-primary w-full" disabled={a.busy}>{a.busy ? "Validando…" : "Canjear ticket"}</button>
    </form>
  );
}
export default function CanjearPage() { return <RequireRole><Suspense><Canjear /></Suspense></RequireRole>; }
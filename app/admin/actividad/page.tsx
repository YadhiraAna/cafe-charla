"use client";
import { useState } from "react";
import { limit, orderBy } from "firebase/firestore";
import { useDocs } from "@/hooks/useDocs";
import RequireRole from "@/components/auth/RequireRole";
import Badge from "@/components/admin/Badge";
import { Empty, Field, PageHead, Spinner, Status } from "@/components/ui";
import { MECANISMOS, Mecanismo } from "@/lib/antibot/config";
import type { Ts } from "@/types";

interface Ev { id: string; ts?: Ts; kind: string; mechanism?: Mecanismo; verdict: string; score: number; signals: string[]; route: string; accion?: string; captcha?: string; datos?: string; userName?: string; userRole?: string; attempts?: number }
const RES: Record<string, [string, string]> = { passed: ["success", "Superado"], captcha_failed: ["error", "CAPTCHA fallido"], blocked: ["error", "Bloqueado"], suspicious: ["pending", "Sospechoso"],
  rate_limited: ["denied", "429 Rate limit"], locked: ["denied", "Bloqueo temporal"], csrf_rejected: ["denied", "CSRF rechazado"], authorized_scraper: ["success", "Extractor autorizado"] };
const CAPTCHAS: [string, string, string][] = [["text", "Texto", "Registro"], ["math", "Matemático", "Login"], ["images", "Imágenes", "Nueva publicación"], ["question", "Pregunta", "Comentario"], ["select", "Selección", "Reseña"]];
const MECS = Object.keys(MECANISMOS) as Mecanismo[];
const mecDe = (e: Ev): Mecanismo => e.mechanism ?? (e.kind === "captcha" ? "captcha" : e.kind === "csrf" ? "sesion" : e.kind === "rate_limit" || e.kind === "bruteforce" ? "rate_limit" : "interaccion");
const bien = (v: string) => v === "passed" || v === "authorized_scraper";
const cuando = (t?: Ts) => (t ? new Date(t.seconds * 1000).toLocaleString("es-MX") : "…");

function Actividad() {
  const { data, error, reload } = useDocs<Ev>("security_events", orderBy("ts", "desc"), limit(300));
  const [mec, setMec] = useState(""), [usr, setUsr] = useState(""), [res, setRes] = useState("");
  const todos = data ?? [];
  const lista = todos.filter(e => (!mec || mecDe(e) === mec) && (!usr || (e.userName ?? "").toLowerCase().includes(usr.toLowerCase())) && (!res || (res === "ok" ? bien(e.verdict) : !bien(e.verdict))));
  const porMec = (m: Mecanismo) => { const l = todos.filter(e => mecDe(e) === m); return [l.length, l.filter(e => !bien(e.verdict)).length]; };
  const porCaptcha = (c: string) => { const l = todos.filter(e => e.kind === "captcha" && e.captcha === c); return [l.filter(e => e.verdict === "passed").length, l.filter(e => e.verdict === "captcha_failed").length]; };

  return (
    <>
      <PageHead title="Actividad de seguridad" lead="Quién hace qué, con qué CAPTCHA y qué mecanismo de seguridad se está ejercitando." action={<button className="btn-ghost" onClick={reload}>Actualizar</button>} />
      <Status error={error} />
      {!data && !error ? <Spinner /> : (<>
        <ul className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {MECS.map(m => { const [t, r] = porMec(m); return <li key={m} className="card"><p className="text-sm text-espresso/70">{MECANISMOS[m]}</p><p className="font-display text-3xl tabular-nums">{t}</p><p className="text-sm">{r} rechazados o alertas</p></li>; })}
        </ul>

        <section aria-labelledby="h-cob" className="card mb-8"><h2 id="h-cob" className="mb-3 text-2xl">Cobertura de CAPTCHAs (se piden 5 distintos)</h2>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><caption className="sr-only">Uso de cada tipo de CAPTCHA</caption>
            <thead><tr className="border-b border-espresso/30">{["Tipo", "Formulario", "Superados", "Fallidos", "Estado"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{CAPTCHAS.map(([k, n, f]) => { const [ok, ko] = porCaptcha(k); return <tr key={k} className="border-b border-espresso/10"><th scope="row" className="p-2">{n}</th><td className="p-2">{f}</td><td className="p-2 tabular-nums">{ok}</td><td className="p-2 tabular-nums">{ko}</td><td className="p-2"><Badge value={ok + ko > 0 ? "success" : "pending"} label={ok + ko > 0 ? "Probado" : "Sin probar"} /></td></tr>; })}</tbody></table></div></section>

        <form className="card mb-6 grid gap-4 md:grid-cols-3" onSubmit={e => e.preventDefault()} aria-label="Filtros">
          <Field label="Mecanismo" id="fm"><select id="fm" className="input" value={mec} onChange={e => setMec(e.target.value)}><option value="">Todos</option>{MECS.map(m => <option key={m} value={m}>{MECANISMOS[m]}</option>)}</select></Field>
          <Field label="Usuario" id="fu"><input id="fu" className="input" placeholder="Nombre o correo enmascarado" value={usr} onChange={e => setUsr(e.target.value)} /></Field>
          <Field label="Resultado" id="fr"><select id="fr" className="input" value={res} onChange={e => setRes(e.target.value)}><option value="">Todos</option><option value="ok">Superados</option><option value="mal">Rechazados o alertas</option></select></Field>
        </form>

        {lista.length === 0 ? <Empty title="Sin actividad con estos filtros">Usa un formulario protegido (login, registro, publicar, comentar, reseñar) y pulsa Actualizar.</Empty> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><caption className="sr-only">Actividad de seguridad</caption>
            <thead><tr className="border-b border-espresso/30">{["Fecha", "Mecanismo", "Usuario", "Acción", "CAPTCHA", "Resultado", "Puntaje", "Intentos", "Datos enviados", "Señales"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{lista.map(e => { const [tone, label] = RES[e.verdict] ?? ["no", e.verdict]; return (
              <tr key={e.id} className="border-b border-espresso/10 align-top">
                <td className="whitespace-nowrap p-2">{cuando(e.ts)}</td><td className="p-2">{MECANISMOS[mecDe(e)]}</td><td className="p-2">{e.userName ?? "Visitante"}<br /><span className="text-espresso/60">{e.userRole ?? ""}</span></td>
                <td className="p-2">{e.accion || e.route}</td><td className="p-2">{CAPTCHAS.find(c => c[0] === e.captcha)?.[1] ?? "—"}</td><td className="p-2"><Badge value={tone} label={label} /></td>
                <td className="p-2 tabular-nums">{e.score}</td><td className="p-2 tabular-nums">{e.attempts ?? 1}</td><td className="p-2">{e.datos || "—"}</td><td className="p-2">{e.signals?.join(", ") || "—"}</td></tr>); })}</tbody></table></div>)}
      </>)}
    </>
  );
}
export default function ActividadPage() { return <RequireRole roles={["admin"]}><Actividad /></RequireRole>; }
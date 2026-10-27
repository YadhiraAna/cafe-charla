"use client";
import { useState } from "react";
import { limit, orderBy } from "firebase/firestore";
import { useDocs } from "@/hooks/useDocs";
import RequireRole from "@/components/auth/RequireRole";
import Badge from "@/components/admin/Badge";
import SeguridadTabs from "@/components/admin/SeguridadTabs";
import { Empty, Field, PageHead, Spinner, Status } from "@/components/ui";
import { MECANISMOS, Mecanismo, TECNICAS, Tecnica } from "@/lib/antibot/config";
import type { Ts } from "@/types";

interface Ev { id: string; ts?: Ts; kind: string; mechanism?: Mecanismo; mecanismos?: Mecanismo[]; tecnicas?: Tecnica[]; evaluadas?: Tecnica[]; verdict: string; score: number; signals: string[]; route: string; accion?: string; captcha?: string; datos?: string; userName?: string; userRole?: string; attempts?: number }
const RES: Record<string, [string, string]> = { passed: ["success", "Superado"], captcha_failed: ["error", "CAPTCHA fallido"], blocked: ["error", "Bloqueado"], suspicious: ["pending", "Sospechoso"],
  rate_limited: ["denied", "429 Rate limit"], locked: ["denied", "Bloqueo temporal"], csrf_rejected: ["denied", "CSRF rechazado"], authorized_scraper: ["success", "Extractor autorizado"], session_expired: ["pending", "Sesión cerrada"] };
const CAPTCHAS: [string, string, string][] = [["text", "Texto", "Registro"], ["math", "Matemático", "Login y canje de ticket"], ["images", "Imágenes", "Nueva publicación"], ["question", "Pregunta", "Comentario"], ["select", "Opción múltiple", "Reseñas"]];
const DESCRIPCION: Record<Mecanismo, string> = {
  captcha: "Suma, pregunta de conocimiento, selección de imágenes, texto y opción múltiple; validados en el servidor.",
  honeypot: "Campo oculto que solo rellena un bot + token de formulario firmado, de un solo uso y con tiempo mínimo.",
  interaccion: "Tiempos y entropía de teclado y ratón, visibilidad de la pestaña y foco de la ventana.",
  huella: "navigator.webdriver, objetos globales de automatización, Navigation Timing, canvas/WebGL/fuentes y User-Agent.",
  rate_limit: "Límite de peticiones por IP y sesión (429), bloqueo real por reincidencia y por fallos de login.",
  sesion: "Cookies firmadas (sesión y actividad), cierre por inactividad y sesión revocable.",
  csrf: "Token CSRF firmado y ligado a la sesión en toda operación que cambia datos, comprobación de Origin y atributos del DOM que rotan cada hora.",
};
const MECS = Object.keys(MECANISMOS) as Mecanismo[], TECS = Object.keys(TECNICAS) as Tecnica[];
const mecsDe = (e: Ev): Mecanismo[] => e.mecanismos?.length ? e.mecanismos : [e.mechanism ?? "captcha"];
const bien = (v: string) => v === "passed" || v === "authorized_scraper";
const cuando = (t?: Ts) => (t ? new Date(t.seconds * 1000).toLocaleString("es-MX") : "…");

function Actividad() {
  const { data, error, reload } = useDocs<Ev>("security_events", orderBy("ts", "desc"), limit(300));
  const [mec, setMec] = useState(""), [tec, setTec] = useState(""), [usr, setUsr] = useState(""), [res, setRes] = useState("");
  const todos = data ?? [];
  const lista = todos.filter(e => (!mec || mecsDe(e).includes(mec as Mecanismo)) && (!tec || e.tecnicas?.includes(tec as Tecnica)) && (!usr || (e.userName ?? "").toLowerCase().includes(usr.toLowerCase())) && (!res || (res === "ok" ? bien(e.verdict) : !bien(e.verdict))));
  const porMec = (m: Mecanismo) => { const l = todos.filter(e => mecsDe(e).includes(m)); return [l.length, l.filter(e => !bien(e.verdict)).length]; };
  const porCaptcha = (c: string) => { const l = todos.filter(e => e.kind === "captcha" && e.captcha === c); return [l.filter(e => e.verdict === "passed").length, l.filter(e => e.verdict === "captcha_failed").length]; };
  const porTecnica = (t: Tecnica) => [todos.filter(e => e.tecnicas?.includes(t) || e.evaluadas?.includes(t)).length, todos.filter(e => e.tecnicas?.includes(t) && !bien(e.verdict)).length];

  return (
    <>
      <PageHead title="Seguridad" lead="Quién hace qué, con qué CAPTCHA y qué mecanismo y técnica anti-bot se está ejercitando." action={<button className="btn-ghost" onClick={reload}>Actualizar</button>} />
      <SeguridadTabs />
      <Status error={error} />
      {!data && !error ? <Spinner /> : (<>
        <section aria-labelledby="h-7" className="card mb-8"><h2 id="h-7" className="mb-3 text-2xl">Los 7 mecanismos contra bots</h2>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Cobertura de los 7 mecanismos</caption>
            <thead><tr className="border-b border-espresso/30">{["Mecanismo", "Qué incluye", "Eventos", "Alertas", "Estado"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{MECS.map(m => { const [n, r] = porMec(m); return <tr key={m} className="border-b border-espresso/10 align-top"><th scope="row" className="p-2">{MECANISMOS[m]}</th><td className="p-2">{DESCRIPCION[m]}</td><td className="p-2 tabular-nums">{n}</td><td className="p-2 tabular-nums">{r}</td><td className="p-2"><Badge value="success" label={n > 0 ? "Activo · con eventos" : "Activo"} /></td></tr>; })}</tbody></table></div></section>

        <section aria-labelledby="h-tec" className="card mb-8"><h2 id="h-tec" className="mb-1 text-2xl">Cobertura de técnicas (tipo)</h2>
          <p className="mb-3 text-sm text-espresso/70">"Eventos" cuenta cada vez que la técnica se evaluó o intervino; "Alertas" cuando detectó algo sospechoso.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="sr-only">Cobertura por técnica</caption>
            <thead><tr className="border-b border-espresso/30">{["Técnica (tipo)", "Eventos", "Alertas", "Estado"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{TECS.map(t => { const [n, a] = porTecnica(t); return <tr key={t} className="border-b border-espresso/10"><th scope="row" className="p-2">{TECNICAS[t]}</th><td className="p-2 tabular-nums">{n}</td><td className="p-2 tabular-nums">{a}</td><td className="p-2"><Badge value={n > 0 ? "success" : "pending"} label={n > 0 ? "En uso" : "Sin eventos aún"} /></td></tr>; })}</tbody></table></div></section>

        <section aria-labelledby="h-cob" className="card mb-8"><h2 id="h-cob" className="mb-3 text-2xl">Cobertura de CAPTCHAs (5 tipos)</h2>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><caption className="sr-only">Uso de cada tipo de CAPTCHA</caption>
            <thead><tr className="border-b border-espresso/30">{["Tipo", "Formulario", "Superados", "Fallidos", "Estado"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{CAPTCHAS.map(([k, n, f]) => { const [ok, ko] = porCaptcha(k); return <tr key={k} className="border-b border-espresso/10"><th scope="row" className="p-2">{n}</th><td className="p-2">{f}</td><td className="p-2 tabular-nums">{ok}</td><td className="p-2 tabular-nums">{ko}</td><td className="p-2"><Badge value={ok + ko > 0 ? "success" : "pending"} label={ok + ko > 0 ? "Probado" : "Sin probar"} /></td></tr>; })}</tbody></table></div></section>

        <form className="card mb-6 grid gap-4 md:grid-cols-4" onSubmit={e => e.preventDefault()} aria-label="Filtros">
          <Field label="Mecanismo" id="fm"><select id="fm" className="input" value={mec} onChange={e => setMec(e.target.value)}><option value="">Todos</option>{MECS.map(m => <option key={m} value={m}>{MECANISMOS[m]}</option>)}</select></Field>
          <Field label="Técnica (tipo)" id="ft"><select id="ft" className="input" value={tec} onChange={e => setTec(e.target.value)}><option value="">Todas</option>{TECS.map(t => <option key={t} value={t}>{TECNICAS[t]}</option>)}</select></Field>
          <Field label="Usuario" id="fu"><input id="fu" className="input" placeholder="Nombre o correo enmascarado" value={usr} onChange={e => setUsr(e.target.value)} /></Field>
          <Field label="Resultado" id="fr"><select id="fr" className="input" value={res} onChange={e => setRes(e.target.value)}><option value="">Todos</option><option value="ok">Superados</option><option value="mal">Rechazados o alertas</option></select></Field>
        </form>

        {lista.length === 0 ? <Empty title="Sin actividad con estos filtros">Usa un formulario protegido (login, registro, publicar, comentar, reseñar, canjear) y pulsa Actualizar.</Empty> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-sm"><caption className="sr-only">Actividad de seguridad</caption>
            <thead><tr className="border-b border-espresso/30">{["Fecha", "Mecanismos", "Técnica (tipo)", "Usuario", "Acción", "CAPTCHA", "Resultado", "Puntaje", "Intentos", "Datos enviados", "Señales"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{lista.map(e => { const [tone, label] = RES[e.verdict] ?? ["no", e.verdict]; return (
              <tr key={e.id} className="border-b border-espresso/10 align-top">
                <td className="whitespace-nowrap p-2">{cuando(e.ts)}</td><td className="p-2">{mecsDe(e).map(m => MECANISMOS[m]).join(" · ")}</td><td className="p-2">{(e.tecnicas ?? []).map(t => TECNICAS[t]).join(", ") || "—"}</td>
                <td className="p-2">{e.userName ?? "Visitante"}<br /><span className="text-espresso/60">{e.userRole ?? ""}</span></td>
                <td className="p-2">{e.accion || e.route}</td><td className="p-2">{CAPTCHAS.find(c => c[0] === e.captcha)?.[1] ?? "—"}</td><td className="p-2"><Badge value={tone} label={label} /></td>
                <td className="p-2 tabular-nums">{e.score}</td><td className="p-2 tabular-nums">{e.attempts ?? 1}</td><td className="p-2">{e.datos || "—"}</td><td className="p-2">{e.signals?.join(", ") || "—"}</td></tr>); })}</tbody></table></div>)}
      </>)}
    </>
  );
}
export default function ActividadPage() { return <RequireRole roles={["admin"]}><Actividad /></RequireRole>; }
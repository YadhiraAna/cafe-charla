"use client";
import { limit, orderBy } from "firebase/firestore";
import { apiFetch } from "@/lib/utils/api";
import { useAction } from "@/hooks/useAction";
import { useDocs } from "@/hooks/useDocs";
import RequireRole from "@/components/auth/RequireRole";
import Badge from "@/components/admin/Badge";
import { Empty, PageHead, Spinner, Status } from "@/components/ui";
import { DOM_ROTATION_MIN, IP_MULTIPLIER, LOGIN_LOCK, MIN_FORM_MS, POLICIES, THRESHOLDS } from "@/lib/antibot/config";
import type { Ts } from "@/types";

interface Ev { id: string; ts?: Ts; kind: string; verdict: string; score: number; attempts?: number; signals: string[]; route: string; ip: string; ipHash: string; ua: string; review: null | "bot" | "human" }
const VERDICT: Record<string, [string, string]> = { blocked: ["error", "Bloqueado"], suspicious: ["pending", "Sospechoso"], rate_limited: ["denied", "429 Rate limit"], authorized_scraper: ["success", "Extractor autorizado"], locked: ["denied", "Bloqueo temporal"] };
const wilson = (k: number, n: number): [number, number] | null => { if (!n) return null; const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [Math.max(0, c - m), Math.min(1, c + m)]; };
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function Security() {
  const a = useAction(), { data, error, reload } = useDocs<Ev>("security_events", orderBy("ts", "desc"), limit(200));
  const count = (v: string) => data?.filter(e => e.verdict === v).length ?? 0;
  const flagged = data?.filter(e => ["blocked", "suspicious"].includes(e.verdict) && e.kind !== "rate_limit") ?? [];
  const bots = flagged.filter(e => e.review === "bot").length, humans = flagged.filter(e => e.review === "human").length, reviewed = bots + humans;
  const ci = wilson(humans, reviewed);
  const buckets = Array.from({ length: 10 }, (_, i) => flagged.filter(e => Math.min(9, Math.floor(e.score / 10)) === i).length), maxB = Math.max(1, ...buckets);
  const sources = Object.entries((data ?? []).reduce<Record<string, number>>((m, e) => ({ ...m, [e.ip]: (m[e.ip] ?? 0) + 1 }), {})).sort((x, y) => y[1] - x[1]).slice(0, 5);
  const mark = (id: string, review: "bot" | "human" | null) => a.run(async () => { await apiFetch(`/api/admin/security/${id}`, { method: "PATCH", body: { review } }); reload(); return "Evento etiquetado."; });
  const when = (t?: Ts) => (t ? new Date(t.seconds * 1000).toLocaleString("es-MX") : "…");

  return (
    <>
      <PageHead title="Seguridad y tráfico sospechoso" lead="Eventos detectados por rate limiting, biometría de comportamiento, fingerprint y fuerza bruta. Etiquétalos para medir los falsos positivos." />
      <Status error={error || a.error} done={a.done} />
      {!data && !error ? <Spinner /> : (<>
        <ul className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          {[["Bloqueados", count("blocked")], ["Sospechosos", count("suspicious")], ["429 (rate limit)", count("rate_limited")], ["Bloqueos temporales", count("locked")], ["Extractor autorizado", count("authorized_scraper")]].map(([l, n]) => <li key={l as string} className="card"><p className="text-sm text-espresso/70">{l}</p><p className="font-display text-4xl tabular-nums">{n}</p></li>)}
        </ul>

        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <section aria-labelledby="h-fp" className="card"><h2 id="h-fp" className="mb-2 text-2xl">Falsos positivos</h2>
            <p className="mb-3 text-sm text-espresso/70">Sobre eventos que tú revisaste (bloqueados o sospechosos por comportamiento/fingerprint).</p>
            {reviewed === 0 ? <p>Aún no hay eventos etiquetados. Marca cada evento como "Bot" o "Humano" en la tabla.</p> : (
              <dl className="grid grid-cols-2 gap-2"><dt>Revisados</dt><dd>{reviewed}</dd><dt>Bots confirmados</dt><dd>{bots}</dd><dt>Humanos (falsos positivos)</dt><dd>{humans}</dd>
                <dt>Tasa de falsos positivos</dt><dd className="font-semibold">{pct(humans / reviewed)}{ci && <span className="font-normal text-sm"> (IC 95%: {pct(ci[0])}–{pct(ci[1])})</span>}</dd></dl>)}
            <p className="mt-3 text-xs text-espresso/60">Limitación: solo se ven los errores de tipo "persona marcada como bot". Los bots que pasaron como humanos (falsos negativos) no generan evento.</p></section>
          <section aria-labelledby="h-sc" className="card"><h2 id="h-sc" className="mb-3 text-2xl">Distribución de puntajes</h2>
            <ul className="space-y-1">{buckets.map((n, i) => <li key={i} className="flex items-center gap-2 text-sm"><span className="w-14 tabular-nums">{i * 10}–{i * 10 + 9}{i === 9 ? "+" : ""}</span><div aria-hidden className="h-3 flex-1 rounded bg-espresso/10"><div className={`h-3 rounded ${i * 10 >= THRESHOLDS.block ? "bg-rojo" : i * 10 >= THRESHOLDS.review ? "bg-caramelo" : "bg-musgo"}`} style={{ width: `${(n / maxB) * 100}%` }} /></div><span className="w-6 tabular-nums">{n}</span></li>)}</ul>
            <p className="mt-2 text-xs text-espresso/60">Umbral de bloqueo: {THRESHOLDS.block} · sospechoso desde {THRESHOLDS.review}.</p></section>
        </div>

        <section aria-labelledby="h-src" className="card mb-8"><h2 id="h-src" className="mb-3 text-2xl">Orígenes con más eventos</h2>
          {sources.length === 0 ? <p>Sin eventos.</p> : <ol className="list-decimal pl-5">{sources.map(([ip, n]) => <li key={ip}>{ip} <span className="text-espresso/60">· {n} eventos</span></li>)}</ol>}
          <p className="mt-2 text-xs text-espresso/60">IP enmascarada (último octeto en 0) por privacidad.</p></section>

        <section aria-labelledby="h-ev" className="mb-8"><div className="mb-2 flex items-center justify-between"><h2 id="h-ev" className="text-2xl">Eventos recientes</h2><button className="btn-ghost" onClick={reload}>Actualizar</button></div>
          {data?.length === 0 ? <Empty title="No hay eventos de seguridad">Prueba las defensas con <code>selenium/pruebas_antibot.py</code> o ejecutando el extractor con <code>--anonymous</code>.</Empty> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><caption className="sr-only">Eventos de seguridad</caption>
              <thead><tr className="border-b border-espresso/30">{["Fecha", "Resultado", "Tipo", "Puntaje", "Intentos", "Ruta", "Origen", "Señales", "Revisión"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
              <tbody>{data?.map(e => { const [tone, label] = VERDICT[e.verdict] ?? ["no", e.verdict]; const reviewable = ["blocked", "suspicious"].includes(e.verdict) && e.kind !== "rate_limit"; return (
                <tr key={e.id} className="border-b border-espresso/10 align-top">
                  <td className="whitespace-nowrap p-2">{when(e.ts)}</td><td className="p-2"><Badge value={tone} label={label} /></td><td className="p-2">{e.kind}</td><td className="p-2 tabular-nums">{e.score}</td><td className="p-2 tabular-nums">{e.attempts ?? 1}</td>
                  <td className="p-2 break-all">{e.route}</td><td className="p-2">{e.ip}<br /><span className="text-espresso/60">{e.ua.slice(0, 40)}</span></td>
                  <td className="p-2">{e.signals.join(", ") || "—"}</td>
                  <td className="p-2">{reviewable ? (<div className="flex flex-wrap gap-1">
                    <button className="btn-ghost !min-h-[32px] !px-2" aria-pressed={e.review === "bot"} disabled={a.busy} onClick={() => mark(e.id, e.review === "bot" ? null : "bot")}>Bot</button>
                    <button className="btn-ghost !min-h-[32px] !px-2" aria-pressed={e.review === "human"} disabled={a.busy} onClick={() => mark(e.id, e.review === "human" ? null : "human")}>Humano</button></div>) : "—"}</td>
                </tr>); })}</tbody></table></div>)}
        </section>

        <section aria-labelledby="h-cfg" className="card"><h2 id="h-cfg" className="mb-3 text-2xl">Configuración activa</h2>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Políticas de rate limiting</caption>
            <thead><tr className="border-b border-espresso/30"><th scope="col" className="p-2">Política</th><th scope="col" className="p-2">Ráfaga por sesión</th><th scope="col" className="p-2">Ráfaga por IP</th><th scope="col" className="p-2">Recarga</th></tr></thead>
            <tbody>{Object.entries(POLICIES).map(([k, v]) => <tr key={k} className="border-b border-espresso/10"><th scope="row" className="p-2">{k}</th><td className="p-2">{v.capacity}</td><td className="p-2">{k === "scraper" || k === "user" ? "—" : v.capacity * IP_MULTIPLIER}</td><td className="p-2">{(v.refillPerSec * 60).toFixed(0)} por minuto</td></tr>)}</tbody></table></div>
          <ul className="mt-3 list-disc pl-5 text-sm"><li>Respuesta al exceder el límite: <strong>HTTP 429</strong> con cabecera <code>Retry-After</code>.</li><li>Formulario enviado en menos de {MIN_FORM_MS} ms (medido en el servidor): bloqueo.</li><li>Fuerza bruta: {LOGIN_LOCK.max} fallos en {LOGIN_LOCK.windowMs / 60000} min bloquean {LOGIN_LOCK.lockMs / 60000} min (por IP y por correo).</li><li>Los atributos del DOM rotan cada {DOM_ROTATION_MIN} min.</li></ul></section>
      </>)}
    </>
  );
}
export default function SecurityPage() { return <RequireRole roles={["admin"]}><Security /></RequireRole>; }

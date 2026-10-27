"use client";
/**
 * Reto CAPTCHA (5 tipos) + telemetría anti-bot invisible. Todo se VALIDA en el servidor.
 * Los IDs/names de los controles cambian con CADA reto (cp-xxxxxx, ci-xxxxxx): no se pueden fijar con By.ID.
 * Un cliente autorizado los localiza con el atributo rotativo data-<sal>="captcha-input" (ver DomProvider).
 * `value.antibot` es un getter: se evalúa al enviar (al hacer `...cap`). `onChange` debe ser estable (un setState).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/utils/api";
import { BehaviorTracker, collectFingerprint } from "@/lib/antibot/client";
import { recogerEntorno } from "@/lib/antibot/entorno";
import { useDom } from "@/components/antibot/DomProvider";
import type { AntibotPayload } from "@/lib/antibot/types";

export type CaptchaKind = "text" | "math" | "images" | "question" | "select";
export interface CaptchaValue { captchaToken: string; captchaAnswer: string; readonly antibot: AntibotPayload }
interface Challenge { token: string; prompt: string; options?: string[]; code?: string; formToken: string }

export default function Captcha({ kind, onChange, resetKey = 0 }: { kind: CaptchaKind; onChange: (v: CaptchaValue | null) => void; resetKey?: number }) {
  const h = useDom();
  const [ch, setCh] = useState<Challenge | null>(null), [ans, setAns] = useState(""), [sel, setSel] = useState<number[]>([]), [err, setErr] = useState(""), [uid, setUid] = useState("");
  const tracker = useRef<BehaviorTracker | null>(null), formToken = useRef(""), honeypot = useRef("");

  useEffect(() => { const t = new BehaviorTracker(); t.start(); tracker.current = t; return () => t.stop(); }, []);

  const load = useCallback(async () => {
    setCh(null); setAns(""); setSel([]); setErr(""); onChange(null);
    try {
      const r = await apiFetch<Challenge>(`/api/captcha?kind=${kind}`, { anon: true });
      formToken.current = r.formToken; setUid(Math.random().toString(36).slice(2, 8)); setCh(r);
    } catch (e: any) { setErr(e.message || "No se pudo cargar la verificación."); }
  }, [kind, onChange]);
  useEffect(() => { load(); }, [load, resetKey]);

  const make = (token: string, answer: string): CaptchaValue => ({
    captchaToken: token, captchaAnswer: answer,
    get antibot(): AntibotPayload { return { formToken: formToken.current, website: honeypot.current,behavior: tracker.current!.snapshot(), fp: collectFingerprint(), entorno: recogerEntorno(window, document, navigator) };  },
  });
  const update = (a: string) => { setAns(a); onChange(ch && a ? make(ch.token, a) : null); };
  const toggle = (i: number) => { const n = sel.includes(i) ? sel.filter(x => x !== i) : [...sel, i].sort((a, b) => a - b); setSel(n); update(n.join(",")); };
  const pid = `cp-${uid}`, iid = `ci-${uid}`;

  return (
    <fieldset className="relative space-y-2 rounded-md border border-espresso/20 p-3">
      <legend className="px-1 text-sm font-semibold">Verificación</legend>
      {/* Campo trampa (honeypot): invisible y fuera del orden de tabulación. Una persona nunca lo rellena. */}
      <input name="hp_confirm_site" tabIndex={-1} autoComplete="off" aria-hidden="true" onChange={e => { honeypot.current = e.target.value; }} style={{ position: "absolute", left: "-10000px", width: 1, height: 1, opacity: 0 }} />
      {err && <p role="alert" className="text-sm text-rojo">{err}</p>}
      {!ch && !err && <p role="status" className="text-sm">Cargando verificación…</p>}
      {ch && (<>
        {kind === "text" && ch.code && (
          <svg role="img" aria-label="Código de 6 caracteres. Si no puedes verlo, genera uno nuevo." width="180" height="56" viewBox="0 0 180 56" className="rounded bg-avena">
            {[...ch.code].map((c, i) => <text key={i} x={14 + i * 27} y={36 + ((i * 7) % 9) - 4} fontSize="28" fontWeight="700" fill="#2B1B12" transform={`rotate(${((i * 13) % 25) - 12} ${14 + i * 27} 30)`}>{c}</text>)}
            {[0, 1, 2].map(i => <line key={i} x1="0" y1={10 + i * 18} x2="180" y2={50 - i * 20} stroke="#A8641A" strokeWidth="1.5" opacity=".6" />)}
          </svg>
        )}
        <p id={pid} className="text-sm">{ch.prompt}</p>
        {(kind === "text" || kind === "math" || kind === "question") && <input id={iid} name={iid} {...h("captcha-input")} className="input" aria-labelledby={pid} autoComplete="off" value={ans} onChange={e => update(e.target.value)} maxLength={50} />}
        {kind === "images" && (
          <div className="grid max-w-xs grid-cols-3 gap-2" role="group" aria-labelledby={pid}>
            {ch.options?.map((o, i) => <button type="button" key={i} aria-pressed={sel.includes(i)} aria-label={`Imagen ${i + 1}`} onClick={() => toggle(i)} className={`flex h-16 items-center justify-center rounded-md border-2 text-3xl ${sel.includes(i) ? "border-caramelo bg-caramelo/15" : "border-espresso/20 bg-espuma"}`}>{o}</button>)}
          </div>
        )}
        {kind === "select" && (
          <div role="radiogroup" aria-labelledby={pid} className="space-y-1">
            {ch.options?.map(o => <label key={o} className="flex min-h-[44px] items-center gap-2"><input type="radio" name={`cs-${uid}`} checked={ans === o} onChange={() => update(o)} />{o}</label>)}
          </div>
        )}
        <button type="button" className="text-sm underline" onClick={load}>Generar otra verificación</button>
      </>)}
    </fieldset>
  );
}
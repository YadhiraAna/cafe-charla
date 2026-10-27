/**
 * Telemetría de comportamiento y huella del navegador (solo navegador). Registra TIEMPOS, MOVIMIENTOS y CONTEOS, nunca qué tecla se
 * pulsó ni el contenido de los campos. El servidor decide con estos números (lib/antibot/score.ts).
 */
import type { AntibotPayload, Behavior, Fingerprint } from "@/lib/antibot/types";
import { entropia, entropiaDirecciones } from "@/lib/antibot/entropia";

const fin = (n: number) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0);
function stats(xs: number[]) {
  if (xs.length === 0) return { mean: 0, cv: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { mean, cv: mean > 0 ? sd / mean : 0 };
}
const gaps = (ts: number[]) => ts.slice(1).map((t, i) => t - ts[i]);

export class BehaviorTracker {
  private t0 = performance.now(); private first = -1; private lastMove = 0;
  private pts: { x: number; y: number }[] = []; private moves = 0;
  private clicks: number[] = []; private keys: number[] = []; private ins: number[] = [];
  private c = { pastes: 0, inputs: 0, focus: 0, scrolls: 0, touches: 0, vis: 0, ocultas: 0, sinFoco: 0 };
  private maxCps = 0; private ocultoDesde = 0; private ocultoMs = 0;

  private touch(now: number) { if (this.first < 0) this.first = now - this.t0; }
  /** API de visibilidad: una persona no puede interactuar con una pestaña oculta. */
  private oculta() { if (document.hidden) this.c.ocultas++; }
  private onMove = (e: MouseEvent) => { const n = performance.now(); if (n - this.lastMove < 16) return; this.lastMove = n; this.touch(n); this.oculta(); this.moves++; this.pts.push({ x: e.clientX, y: e.clientY }); if (this.pts.length > 400) this.pts.shift(); };
  private onClick = () => { const n = performance.now(); this.touch(n); this.oculta(); this.clicks.push(n); if (this.clicks.length > 100) this.clicks.shift(); };
  private onKey = (e: KeyboardEvent) => {
    if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;
    const n = performance.now(); this.touch(n); this.oculta();
    if (typeof document.hasFocus === "function" && !document.hasFocus()) this.c.sinFoco++; // teclas sin que la ventana tenga el foco
    this.keys.push(n); if (this.keys.length > 300) this.keys.shift();
  };
  private onInput = (e: Event) => {
    const n = performance.now(); this.c.inputs++;
    if ((e as InputEvent).inputType === "insertText") {
      this.ins.push(n); if (this.ins.length > 200) this.ins.shift();
      let k = 0; for (let i = this.ins.length - 1; i >= 0 && this.ins[i] > n - 1000; i--) k++;
      this.maxCps = Math.max(this.maxCps, k);
    }
  };
  private onPaste = () => { this.c.pastes++; };
  private onFocus = () => { this.c.focus++; };
  private onScroll = () => { this.c.scrolls++; };
  private onTouch = () => { this.touch(performance.now()); this.oculta(); this.c.touches++; };
  private onVis = () => {
    this.c.vis++;
    if (document.hidden) this.ocultoDesde = performance.now();
    else if (this.ocultoDesde) { this.ocultoMs += performance.now() - this.ocultoDesde; this.ocultoDesde = 0; }
  };

  start() {
    document.addEventListener("mousemove", this.onMove, { passive: true }); document.addEventListener("click", this.onClick);
    document.addEventListener("keydown", this.onKey); document.addEventListener("input", this.onInput); document.addEventListener("paste", this.onPaste);
    document.addEventListener("focusin", this.onFocus); window.addEventListener("scroll", this.onScroll, { passive: true, capture: true });
    document.addEventListener("touchstart", this.onTouch, { passive: true }); document.addEventListener("visibilitychange", this.onVis);
  }
  stop() {
    document.removeEventListener("mousemove", this.onMove); document.removeEventListener("click", this.onClick); document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("input", this.onInput); document.removeEventListener("paste", this.onPaste); document.removeEventListener("focusin", this.onFocus);
    window.removeEventListener("scroll", this.onScroll, { capture: true }); document.removeEventListener("touchstart", this.onTouch); document.removeEventListener("visibilitychange", this.onVis);
  }

  snapshot(): Behavior {
    let path = 0, changes = 0; const speeds: number[] = []; let prevAngle: number | null = null;
    for (let i = 1; i < this.pts.length; i++) {
      const dx = this.pts[i].x - this.pts[i - 1].x, dy = this.pts[i].y - this.pts[i - 1].y, d = Math.hypot(dx, dy);
      path += d; speeds.push(d / 16);
      if (d > 2) { const a = Math.atan2(dy, dx); if (prevAngle !== null && Math.abs(a - prevAngle) > 0.5) changes++; prevAngle = a; }
    }
    const disp = this.pts.length > 1 ? Math.hypot(this.pts[this.pts.length - 1].x - this.pts[0].x, this.pts[this.pts.length - 1].y - this.pts[0].y) : 0;
    const sp = stats(speeds), ck = stats(gaps(this.clicks)), ky = stats(gaps(this.keys));
    const oculto = this.ocultoMs + (this.ocultoDesde ? performance.now() - this.ocultoDesde : 0);
    return {
      ageMs: fin(performance.now() - this.t0), firstMs: fin(this.first < 0 ? 0 : this.first),
      mouseMoves: this.moves, mousePath: fin(path), speedMean: fin(sp.mean), speedCv: fin(sp.cv), straightness: fin(path > 0 ? disp / path : 1), dirChanges: changes,
      clicks: this.clicks.length, clickMean: fin(ck.mean), clickCv: fin(ck.cv), keys: this.keys.length, keyMean: fin(ky.mean), keyCv: fin(ky.cv),
      pastes: this.c.pastes, inputs: this.c.inputs, maxCps: this.maxCps, focusSwitches: this.c.focus, scrolls: this.c.scrolls, touches: this.c.touches,
      entKeys: fin(entropia(gaps(this.keys), 10)), entMouseDir: fin(entropiaDirecciones(this.pts)), entMouseSpeed: fin(entropia(speeds, 0.1)),
      hiddenInteractions: this.c.ocultas, unfocusedKeys: this.c.sinFoco, visChanges: this.c.vis, hiddenMs: fin(oculto),
    };
  }
}

/** Parámetros que suelen delatar a un navegador automatizado. */
export function collectFingerprint(): Fingerprint {
  const n = navigator;
  return {
    webdriver: n.webdriver === true, plugins: n.plugins?.length ?? 0, languages: n.languages?.length ?? 0, chrome: !!(window as any).chrome,
    outerW: window.outerWidth || 0, outerH: window.outerHeight || 0, screenW: screen.width || 0, screenH: screen.height || 0,
    touch: (n.maxTouchPoints ?? 0) > 0, tz: new Date().getTimezoneOffset(), ua: n.userAgent.slice(0, 200),
  };
}
export type { AntibotPayload };
/**
 * Recolección en el NAVEGADOR de las técnicas avanzadas anti-bot. Todo es gratuito, local y sin claves de API.
 * Las funciones reciben window/document/navigator como parámetro para poder probarlas sin navegador.
 */
import type { Entorno } from "@/lib/antibot/types";

// ── 1) Objetos globales que inyectan ChromeDriver/Selenium, PhantomJS, Nightmare, Playwright y Puppeteer ──
// (se evita "phantom" a secas porque la billetera Phantom de criptomonedas crea window.phantom legítimamente)
const PATRON_GLOBALS = /^\$?cdc_|^\$chrome_asyncScriptInfo$|^__(selenium|webdriver|driver|fxdriver|nightmare|phantomas|lastWatirAlert)|_selenium|calledSelenium|^_phantom$|^callPhantom$|^domAutomation(Controller)?$|webdriver[-_]evaluate|driver[-_]evaluate|_Selenium_IDE_Recorder|^__playwright|^__pw_|^__puppeteer/i;

export function detectarGlobals(win: any, doc: any): string[] {
  const hallados = new Set<string>();
  for (const objeto of [win, doc]) {
    let nombres: string[] = [];
    try { nombres = Object.getOwnPropertyNames(objeto); } catch { /* objeto no enumerable */ }
    for (const n of nombres) if (PATRON_GLOBALS.test(n)) hallados.add(n.slice(0, 60));
  }
  try { for (const a of ["selenium", "webdriver", "driver"]) if (doc.documentElement?.hasAttribute?.(a)) hallados.add(`html[${a}]`); } catch { /* sin documentElement */ }
  return Array.from(hallados).slice(0, 8);
}

/** En Chrome normal "webdriver" es un getter de Navigator.prototype. Si está como propiedad PROPIA de navigator, alguien lo redefinió para ocultarse. */
export const webdriverSobrescrito = (nav: any): boolean => Object.prototype.hasOwnProperty.call(nav, "webdriver");

// ── 2) Performance Navigation Timing: el orden real de una carga es siempre el mismo ──
export function analizarNavigation(e: any): Entorno["nav"] {
  if (!e) return { presente: false, incoherente: false, tipo: "", loadMs: 0 };
  const v = (k: string) => (typeof e[k] === "number" && isFinite(e[k]) ? e[k] : 0);
  // inicio ≤ petición ≤ inicio de respuesta ≤ fin de respuesta ≤ DOM interactivo ≤ DOMContentLoaded (los ceros = "sin dato" y se ignoran)
  const orden = [v("startTime"), v("requestStart"), v("responseStart"), v("responseEnd"), v("domInteractive"), v("domContentLoadedEventEnd")].filter(x => x > 0);
  const incoherente = orden.some((x, i) => i > 0 && x + 1 < orden[i - 1]);
  return { presente: true, incoherente, tipo: String(e.type ?? "").slice(0, 20), loadMs: Math.max(0, Math.round(v("loadEventEnd") - v("startTime"))) };
}

// ── 3) Huella de fuentes, canvas, WebGL y hardware ──
export const FUENTES = ["Arial", "Verdana", "Times New Roman", "Courier New", "Georgia", "Trebuchet MS", "Tahoma", "Segoe UI", "Roboto", "Helvetica", "Calibri", "Cambria",
  "Impact", "Comic Sans MS", "Menlo", "Monaco", "Consolas", "Ubuntu", "DejaVu Sans", "Liberation Sans", "Noto Sans", "Open Sans", "Lucida Grande", "Palatino", "Garamond"];

/** Una fuente está instalada si el texto mide distinto con ella que con la fuente genérica de respaldo. */
export function fuentesDetectadas(medir: (familia: string) => number, lista: string[] = FUENTES): number {
  const bases = ["monospace", "sans-serif", "serif"], anchoBase = bases.map(b => medir(b));
  return lista.filter(f => bases.some((b, i) => medir(`'${f}', ${b}`) !== anchoBase[i])).length;
}

/** Hash rápido de 53 bits (cyrb53). No es criptográfico: solo resume la huella en un identificador corto. */
export function hash53(texto: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) { const c = texto.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function dibujarCanvas(doc: any): string {
  const c = doc.createElement("canvas"); c.width = 240; c.height = 60;
  const x = c.getContext("2d"); if (!x) return "";
  x.textBaseline = "top"; x.font = "16px Arial"; x.fillStyle = "#f60"; x.fillRect(10, 5, 100, 30);
  x.fillStyle = "#069"; x.fillText("Café & Charla ☕ 0123456789", 4, 12);
  x.font = "18px 'Times New Roman'"; x.fillStyle = "rgba(102,204,0,0.7)"; x.fillText("Fingerprint ✓ ñ ü", 40, 34);
  x.globalCompositeOperation = "multiply"; x.fillStyle = "rgb(255,0,255)"; x.beginPath(); x.arc(50, 50, 30, 0, Math.PI * 2); x.fill();
  return c.toDataURL();
}
function lienzoVacio(doc: any): string { const c = doc.createElement("canvas"); c.width = 240; c.height = 60; return c.toDataURL(); }
function renderizadorWebgl(doc: any): string {
  try {
    const c = doc.createElement("canvas"), gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).slice(0, 120);
  } catch { return ""; }
}

let memoria: Entorno["huella"] | null = null;
function calcularHuella(win: any, doc: any, nav: any): Entorno["huella"] {
  let canvas = "", canvasRuido = false, canvasOk = false, fuentes = 0;
  try {
    canvas = dibujarCanvas(doc);
    canvasOk = canvas.length > 1000 && canvas !== lienzoVacio(doc);     // en blanco = bloqueado por una extensión o un navegador sin gráficos
    canvasRuido = canvasOk && dibujarCanvas(doc) !== canvas;             // dos dibujos idénticos deberían dar el mismo resultado; si no, hay ruido inyectado
  } catch { /* canvas no disponible */ }
  try { const ctx = doc.createElement("canvas").getContext("2d"); if (ctx) fuentes = fuentesDetectadas(f => { ctx.font = `72px ${f}`; return ctx.measureText("mmmmmmmmmmlli0O").width; }); } catch { /* sin 2d */ }
  const webgl = renderizadorWebgl(doc);
  const base = { cores: nav.hardwareConcurrency || 0, memoria: nav.deviceMemory || 0, colores: win.screen?.colorDepth || 0, dpr: win.devicePixelRatio || 0 };
  return { hash: hash53(JSON.stringify([canvas, webgl, fuentes, base, nav.languages?.length ?? 0])), canvasOk, canvasRuido, webgl, fuentes, ...base };
}

/** Reúne todo el entorno. La huella se calcula una sola vez por página (≈20 ms) y se reutiliza. */
export function recogerEntorno(win: any, doc: any, nav: any): Entorno {
  if (!memoria) memoria = calcularHuella(win, doc, nav);
  let entrada: any = null;
  try { entrada = win.performance?.getEntriesByType?.("navigation")?.[0] ?? null; } catch { /* sin Performance API */ }
  return { globals: detectarGlobals(win, doc), webdriverSobrescrito: webdriverSobrescrito(nav), nav: analizarNavigation(entrada), huella: memoria };
}
/**
 * Puntaje de "probabilidad de bot" (0-100). Código puro y determinista, fácil de probar.
 * Cada señal suma un peso; ninguna regla aislada bloquea a una persona real salvo las IMPOSIBLES para un humano
 * (honeypot, envío < 1 s, objeto global de ChromeDriver, interacción con la pestaña oculta). ≥70 bloquea, 40-69 queda como sospechoso.
 */
import { THRESHOLDS } from "@/lib/antibot/config";
import type { Behavior, Entorno, Fingerprint } from "@/lib/antibot/types";

export interface Signal { name: string; weight: number }

const TOOL_UA = /curl|wget|python|requests|httpclient|scrapy|selenium|phantom|headless|go-http|java\/|okhttp|axios|node-fetch|libwww|crawler|spider|\bbot\b/i;

/** Señales de las cabeceras HTTP de la petición. */
export function scoreHeaders(h: { ua: string; acceptLanguage: string }): Signal[] {
  const s: Signal[] = [];
  if (!h.ua) s.push({ name: "user_agent_vacio", weight: 50 });
  else if (TOOL_UA.test(h.ua)) s.push({ name: "user_agent_de_herramienta", weight: 60 });
  if (!h.acceptLanguage) s.push({ name: "sin_accept_language", weight: 10 });
  return s;
}

/** Señales del navegador (navigator.webdriver, tamaños de ventana, etc.). */
export function scoreFingerprint(fp?: Fingerprint, headerUa?: string): Signal[] {
  if (!fp) return [{ name: "sin_fingerprint", weight: 15 }];
  const s: Signal[] = [];
  if (fp.webdriver) s.push({ name: "webdriver", weight: 60 });
  if (/HeadlessChrome/i.test(fp.ua)) s.push({ name: "headless_ua", weight: 50 });
  if (fp.outerW === 0 || fp.outerH === 0) s.push({ name: "ventana_sin_tamano", weight: 20 });
  if (fp.screenW === 0 || fp.screenH === 0) s.push({ name: "pantalla_cero", weight: 20 });
  if (fp.languages === 0) s.push({ name: "sin_idiomas", weight: 15 });
  if (/Chrome\//.test(fp.ua) && !fp.chrome && !fp.touch) s.push({ name: "chrome_sin_objeto_chrome", weight: 10 });
  if (headerUa && fp.ua && headerUa.slice(0, 200) !== fp.ua) s.push({ name: "ua_inconsistente", weight: 20 });
  return s;
}

/** Señales de comportamiento (mouse, clics, teclado, velocidad), de entropía de eventos y de la API de visibilidad de la página. */
export function scoreBehavior(b?: Partial<Behavior>): Signal[] {
  if (!b) return [{ name: "sin_telemetria_de_comportamiento", weight: 40 }];
  const n = (k: keyof Behavior) => Number(b[k] ?? 0);
  const s: Signal[] = [];
  const touch = n("touches") > 0, interactions = n("mouseMoves") + n("clicks") + n("keys") + n("touches");
  if (n("ageMs") < 2000) s.push({ name: "formulario_rapido_segun_cliente", weight: 25 });
  if (interactions === 0) s.push({ name: "sin_interaccion", weight: 40 });
  if (!touch && n("clicks") > 0 && n("mouseMoves") === 0) s.push({ name: "clic_sin_movimiento_de_mouse", weight: 20 });
  if (n("keys") >= 5 && n("keyMean") < 15) s.push({ name: "tecleo_instantaneo", weight: 30 });
  else if (n("keys") >= 10 && n("keyCv") < 0.08) s.push({ name: "tecleo_demasiado_uniforme", weight: 25 });
  if (n("pastes") === 0 && n("maxCps") > 25) s.push({ name: "velocidad_de_escritura_sobrehumana", weight: 25 });
  if (n("mouseMoves") >= 5 && n("straightness") > 0.98 && n("dirChanges") === 0) s.push({ name: "mouse_perfectamente_lineal", weight: 15 });
  if (n("clicks") >= 4 && n("clickCv") < 0.05) s.push({ name: "clics_a_intervalos_identicos", weight: 15 });
  // Entropía de Shannon: detecta patrones repetitivos que la variación (CV) no ve, p. ej. alternar 50 y 150 ms
  if (b.entKeys !== undefined && n("keys") >= 12 && n("entKeys") < 1.2) s.push({ name: "entropia_teclado_baja", weight: 40 });
  if (b.entMouseDir !== undefined && n("mouseMoves") >= 40 && n("entMouseDir") < 0.9) s.push({ name: "entropia_mouse_baja", weight: 25 });
  // API de visibilidad: una persona no puede interactuar con una pestaña oculta ni teclear en una ventana sin foco
  if (n("hiddenInteractions") >= 5) s.push({ name: "interaccion_con_pagina_oculta", weight: 70 });
  if (n("unfocusedKeys") >= 3) s.push({ name: "teclas_sin_foco", weight: 25 });
  return s;
}

/** Técnicas del entorno: objetos globales, webdriver sobrescrito, Navigation Timing y huella (canvas, WebGL, fuentes). */
export function scoreEntorno(e: Entorno | undefined, touch: boolean, ua: string): Signal[] {
  if (!e) return [{ name: "sin_datos_de_entorno", weight: 15 }];
  const s: Signal[] = [];
  if (e.globals.length) s.push({ name: "globals_automatizacion", weight: 80 });
  if (e.webdriverSobrescrito) s.push({ name: "webdriver_ocultado", weight: 50 });
  if (!e.nav.presente) s.push({ name: "sin_navigation_timing", weight: 10 });
  if (e.nav.incoherente) s.push({ name: "navigation_timing_incoherente", weight: 40 });
  if (!e.huella.canvasOk) s.push({ name: "canvas_bloqueado_o_vacio", weight: 20 });
  if (e.huella.canvasRuido) s.push({ name: "ruido_en_canvas", weight: 25 });
  if (/swiftshader|llvmpipe|software/i.test(e.huella.webgl)) s.push({ name: "render_por_software", weight: 20 });
  if (!touch && e.huella.fuentes < 3) s.push({ name: "pocas_fuentes", weight: 20 });
  if (/Mobi|Android|iPhone|iPad/i.test(ua) && !touch) s.push({ name: "ua_movil_sin_tactil", weight: 25 });
  return s;
}

export const total = (signals: Signal[]) => Math.min(100, signals.reduce((a, s) => a + s.weight, 0));
export type Level = "human" | "suspicious" | "blocked";
export const levelOf = (score: number): Level => (score >= THRESHOLDS.block ? "blocked" : score >= THRESHOLDS.review ? "suspicious" : "human");
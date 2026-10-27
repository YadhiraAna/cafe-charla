/** Configuración central de las defensas anti-bot, de la sesión y de los términos (también la muestran los paneles de admin). */
export const POLICIES = {
  auth:    { capacity: 5,   refillPerSec: 5 / 60 },    // login, registro, recuperar contraseña: ~5 por minuto
  captcha: { capacity: 20,  refillPerSec: 20 / 60 },   // generar retos CAPTCHA
  csrf:    { capacity: 30,  refillPerSec: 0.5 },       // pedir el token CSRF
  write:   { capacity: 20,  refillPerSec: 30 / 60 },   // acciones de escritura (por IP y por sesión)
  user:    { capacity: 30,  refillPerSec: 1 },         // por usuario autenticado
  beacon:  { capacity: 6,   refillPerSec: 6 / 60 },    // envío de la huella al cargar la página
  canje:   { capacity: 6,   refillPerSec: 6 / 60 },    // canjear tickets (frena adivinar códigos)
  scraper: { capacity: 120, refillPerSec: 2 },         // extractor autorizado (límite propio, más alto)
} as const;
export type Policy = Exclude<keyof typeof POLICIES, "scraper">;

/** BLOQUEO REAL por reincidencia: si una IP o sesión agota su cubeta `max` veces en `windowMs`, queda bloqueada `lockMs`
 *  (y el bloqueo se duplica en cada reincidencia, hasta ×4). Mientras dura, ni siquiera se recargan tokens. */
export const PENALIZACION: Record<string, { max: number; windowMs: number; lockMs: number }> = {
  auth:    { max: 2, windowMs: 10 * 60_000, lockMs: 15 * 60_000 },
  canje:   { max: 3, windowMs: 10 * 60_000, lockMs: 10 * 60_000 },
  default: { max: 4, windowMs: 5 * 60_000,  lockMs: 5 * 60_000 },
};

export const IP_MULTIPLIER = 3;     // la cubeta por IP es 3× la de sesión: tolera varias personas tras la misma red (NAT)
export const STAFF_MULTIPLIER = 3;  // moderadores, cajeros y admins hacen operaciones en lote
export const THRESHOLDS = { block: 70, review: 40 } as const;   // puntaje 0-100: ≥70 bloquea, 40-69 sospechoso
export const MIN_FORM_MS = 1000;                   // un formulario no puede enviarse antes de 1 s (medido en el SERVIDOR)
export const FORM_TOKEN_TTL_MS = 30 * 60 * 1000;
export const SCRAPER_COOKIE_TTL_S = 2 * 3600;
/** Login: TODO intento fallido cuenta (CAPTCHA incorrecto, bloqueo anti-bot o contraseña errónea). Por correo: 5 en 10 min → 15 min. Por IP: 15. */
export const LOGIN_LOCK = { max: 5, windowMs: 10 * 60_000, lockMs: 15 * 60_000 };
export const LOGIN_LOCK_IP = { max: 15, windowMs: 10 * 60_000, lockMs: 15 * 60_000 };
export const DOM_ROTATION_MIN = 60;                // los atributos de selección del DOM rotan cada 60 min
export const EVENT_DEDUPE_MS = 60_000, MAX_EVENTS_PER_HOUR = 600;  // protegen la cuota de escrituras de Firestore

export const scale = (p: { capacity: number; refillPerSec: number }, m: number) => ({ capacity: p.capacity * m, refillPerSec: p.refillPerSec * m });

/** Los 7 mecanismos de seguridad contra bots, con el nombre que se muestra en los paneles. */
export const MECANISMOS = {
  captcha: "1 · CAPTCHA / Puzzle (5 tipos)",
  honeypot: "2 · Campo trampa y desafío de un solo uso",
  interaccion: "3 · Interacción humana y entropía",
  huella: "4 · Huella y detección de automatización",
  rate_limit: "5 · Rate limiting y bloqueo",
  sesion: "6 · Sesión, cookies e inactividad",
  csrf: "7 · CSRF y DOM dinámico",
} as const;
export type Mecanismo = keyof typeof MECANISMOS;

/** Técnicas anti-bot (el "tipo" que aparece en logs y paneles). */
export const TECNICAS = {
  globals: "Objetos globales de automatización",
  webdriver: "Propiedad navigator.webdriver",
  visibilidad: "API de visibilidad de la página",
  timing: "Navigation Timing (rendimiento)",
  huella: "Huella de canvas, WebGL y fuentes",
  entropia: "Entropía de eventos (teclado y ratón)",
  comportamiento: "Métricas de comportamiento",
  parametros: "Parámetros del navegador",
  cabeceras: "Cabeceras HTTP y User-Agent",
  honeypot: "Campo trampa (honeypot)",
  token: "Desafío temporal de un solo uso (token de formulario)",
  csrf: "Token CSRF y origen de la petición",
  captcha: "CAPTCHA / puzzle",
  rate_limit: "Rate limiting y bloqueo por fallos",
  sesion: "Sesión e inactividad",
} as const;
export type Tecnica = keyof typeof TECNICAS;

/** A qué mecanismo (de los 7) pertenece cada técnica. */
export const MECANISMO_DE_TECNICA: Record<Tecnica, Mecanismo> = {
  captcha: "captcha", honeypot: "honeypot", token: "honeypot",
  comportamiento: "interaccion", entropia: "interaccion", visibilidad: "interaccion",
  globals: "huella", webdriver: "huella", huella: "huella", parametros: "huella", cabeceras: "huella", timing: "huella",
  rate_limit: "rate_limit", sesion: "sesion", csrf: "csrf",
};
/** Si un evento toca varios mecanismos, el principal es el primero de esta lista. */
export const PRIORIDAD_MECANISMO: Mecanismo[] = ["huella", "interaccion", "honeypot", "csrf", "rate_limit", "sesion", "captcha"];
export function mecanismosDe(tecnicas: Tecnica[]): Mecanismo[] {
  const m = new Set(tecnicas.map(t => MECANISMO_DE_TECNICA[t]));
  return PRIORIDAD_MECANISMO.filter(x => m.has(x));
}

/** A qué técnica pertenece cada señal que genera el sistema. */
export const TECNICA_DE_SENAL: Record<string, Tecnica> = {
  globals_automatizacion: "globals", webdriver: "webdriver", webdriver_ocultado: "webdriver",
  interaccion_con_pagina_oculta: "visibilidad", teclas_sin_foco: "visibilidad",
  sin_navigation_timing: "timing", navigation_timing_incoherente: "timing", telemetria_incoherente_con_servidor: "timing",
  canvas_bloqueado_o_vacio: "huella", ruido_en_canvas: "huella", render_por_software: "huella", pocas_fuentes: "huella",
  ua_movil_sin_tactil: "huella", huella_en_muchas_sesiones: "huella", sin_datos_de_entorno: "huella",
  entropia_teclado_baja: "entropia", entropia_mouse_baja: "entropia",
  formulario_rapido_segun_cliente: "comportamiento", sin_interaccion: "comportamiento", clic_sin_movimiento_de_mouse: "comportamiento",
  tecleo_instantaneo: "comportamiento", tecleo_demasiado_uniforme: "comportamiento", velocidad_de_escritura_sobrehumana: "comportamiento",
  mouse_perfectamente_lineal: "comportamiento", clics_a_intervalos_identicos: "comportamiento",
  sin_telemetria_de_comportamiento: "comportamiento", sin_telemetria: "comportamiento",
  headless_ua: "parametros", ventana_sin_tamano: "parametros", pantalla_cero: "parametros", sin_idiomas: "parametros",
  chrome_sin_objeto_chrome: "parametros", sin_fingerprint: "parametros", sesion_marcada_por_fingerprint: "parametros",
  user_agent_vacio: "cabeceras", user_agent_de_herramienta: "cabeceras", sin_accept_language: "cabeceras", ua_inconsistente: "cabeceras",
  honeypot_rellenado: "honeypot", token_de_formulario_invalido: "token", formulario_enviado_demasiado_rapido: "token",
  token_de_formulario_de_otra_sesion: "csrf", origin_distinto_del_sitio: "csrf", token_csrf_invalido: "csrf",
  bloqueo_temporal_activo: "rate_limit", umbral_de_fallos_alcanzado: "rate_limit", cuenta_o_ip_bloqueada_temporalmente: "rate_limit",
  bloqueo_temporal_por_reincidencia: "rate_limit",
  inactividad_servidor: "sesion", sesion_cerrada_por_inactividad: "sesion",
};
/** Técnicas que se EVALÚAN en cada verificación cuando el navegador envía la telemetría completa. */
export const TECNICAS_EVALUADAS: Tecnica[] = ["cabeceras", "parametros", "webdriver", "globals", "visibilidad", "timing", "huella", "entropia", "comportamiento", "honeypot", "token"];
export function tecnicasDe(senales: string[]): Tecnica[] {
  const salida = new Set<Tecnica>();
  for (const s of senales) { const t = s.startsWith("politica:") ? "rate_limit" : TECNICA_DE_SENAL[s]; if (t) salida.add(t as Tecnica); }
  return Array.from(salida);
}

/** Inactividad: minutos sin actividad antes de cerrar la sesión, por rol. Se avisa antes; el servidor tolera más que el navegador. */
export const INACTIVIDAD_MIN: Record<string, number> = { user: 15, waiter: 10, moderator: 10, admin: 10 };
export const AVISO_SEG = 60;                  // aviso previo, en segundos
export const LATIDO_MS = 5 * 60_000;          // mientras hay uso, el navegador renueva la actividad en el servidor cada 5 min
export const INACTIVIDAD_SERVIDOR_MIN = 30;
/** Versión vigente de Términos y Privacidad: si cambia, todas las personas deben volver a aceptar. */
export const TERMINOS_VERSION = "2026-10";
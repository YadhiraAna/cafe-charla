/** Configuración central de las defensas anti-bot (también la muestra /admin/seguridad). */
export const POLICIES = {
  auth:    { capacity: 5,   refillPerSec: 5 / 60 },    // login, registro, recuperar contraseña: ~5 por minuto
  captcha: { capacity: 20,  refillPerSec: 20 / 60 },   // generar retos CAPTCHA
  write:   { capacity: 20,  refillPerSec: 30 / 60 },   // acciones de escritura (por IP y por sesión)
  user:    { capacity: 30,  refillPerSec: 1 },         // por usuario autenticado
  beacon:  { capacity: 6,   refillPerSec: 6 / 60 },    // envío de fingerprint
  scraper: { capacity: 120, refillPerSec: 2 },         // extractor autorizado (límite propio, más alto)
  canje:   { capacity: 6,   refillPerSec: 6 / 60 },    // canjear tickets (frena adivinar códigos)
} as const;
export type Policy = Exclude<keyof typeof POLICIES, "scraper">;

export const IP_MULTIPLIER = 3;     // la cubeta por IP es 3× la de sesión: tolera varias personas tras la misma red (NAT)
export const STAFF_MULTIPLIER = 3;  // moderadores y admins hacen operaciones en lote
export const THRESHOLDS = { block: 70, review: 40 } as const;   // puntaje 0-100: ≥70 bloquea, 40-69 sospechoso
export const MIN_FORM_MS = 1000;                     // un formulario no puede enviarse antes de 1 s (medido en el SERVIDOR)
export const FORM_TOKEN_TTL_MS = 30 * 60 * 1000;
export const SCRAPER_COOKIE_TTL_S = 2 * 3600;
export const LOGIN_LOCK = { max: 8, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
export const DOM_ROTATION_MIN = 60;                  // los atributos de selección del DOM rotan cada 60 min
export const EVENT_DEDUPE_MS = 60_000, MAX_EVENTS_PER_HOUR = 300;  // protegen la cuota de escrituras de Firestore

export const scale = (p: { capacity: number; refillPerSec: number }, m: number) => ({ capacity: p.capacity * m, refillPerSec: p.refillPerSec * m });

/** Los 4 mecanismos de seguridad que se evalúan, con el nombre que se muestra en el panel. */
export const MECANISMOS = {
  captcha: "1 · CAPTCHA / Puzzle",
  interaccion: "2 · Interacción humana",
  rate_limit: "3 · Rate limiting",
  sesion: "4 · Sesión, CSRF y DOM dinámico",
} as const;
export type Mecanismo = keyof typeof MECANISMOS;
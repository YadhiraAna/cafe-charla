/**
 * Reglas de negocio de tickets y reseñas. Código PURO (sin Firebase ni Next):
 * lo usa el SERVIDOR para imponerlas y el CLIENTE solo para mostrar avisos.
 */
export const PREFIJO = "CAFE-";
export const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sin I, O, 0, 1: evita confusiones al teclear
export const LONGITUD = 6;                                    // 6 caracteres ≈ 900 millones de combinaciones (con 4 serían adivinables)
export const TTL_HORAS = 48;                                  // tiempo durante el cual el ticket sigue activo para canjearse
export const MAX_PERSONAS = 20;
export const MAX_CANTIDAD = 20;                               // unidades máximas de un mismo producto en un ticket
export const ANTIGUEDAD_MAX_HORAS = 72;                       // un consumo registrado a mano no puede ser más antiguo que esto
export const TOLERANCIA_FUTURO_MIN = 5;

export const MSG = {
  noExiste: "El ticket no existe. Revisa el código.",
  inactivo: "Este ticket no está activo.",
  vencido: "Este ticket ya venció.",
  yaUsado: "Ya utilizaste este ticket anteriormente.",
  sinUsos: "Este ticket ya alcanzó el límite máximo de participantes.",
  noConsumido: "No puedes reseñar un producto que no consumiste.",
  volverConsumir: "Debes volver a consumir este producto para actualizar tu reseña.",
  yaResenado: "Ya publicaste una reseña de este producto.",
} as const;

const FORMATO = new RegExp(`^${PREFIJO}[${ALFABETO}]{${LONGITUD}}$`);
/** Acepta "cafe-x92a6k", "X92A6K" o con espacios; devuelve el código canónico o null si el formato no es válido. */
export function normalizarCodigo(entrada: string): string | null {
  const s = (entrada ?? "").toUpperCase().replace(/\s+/g, "");
  const c = s.startsWith(PREFIJO) ? s : `${PREFIJO}${s}`;
  return FORMATO.test(c) ? c : null;
}

/** `reservado` = 1 mientras hay una persona INVITADA (por su correo) que aún no ha iniciado sesión: su lugar queda apartado para ella. */
export interface TicketLite { status: string; uses: number; maxUses: number; expiresAtMs: number; reservado?: number }
export type ResultadoCanje = { ok: true } | { ok: false; motivo: "no_existe" | "inactivo" | "vencido" | "ya_usado" | "sin_usos"; mensaje: string };
/** Orden: existe → activo → no vencido → no lo usó antes → quedan lugares (los apartados para otra persona no cuentan como libres). */
export function puedeCanjear(t: TicketLite | null, yaLoUso: boolean, ahoraMs: number, esInvitado = false): ResultadoCanje {
  if (!t) return { ok: false, motivo: "no_existe", mensaje: MSG.noExiste };
  if (t.status !== "active") return { ok: false, motivo: "inactivo", mensaje: MSG.inactivo };
  if (ahoraMs > t.expiresAtMs) return { ok: false, motivo: "vencido", mensaje: MSG.vencido };
  if (yaLoUso) return { ok: false, motivo: "ya_usado", mensaje: MSG.yaUsado };
  const apartadosParaOtros = esInvitado ? 0 : t.reservado ?? 0;
  if (t.uses + apartadosParaOtros >= t.maxUses) return { ok: false, motivo: "sin_usos", mensaje: MSG.sinUsos };
  return { ok: true };
}

/** Valida la fecha/hora de consumo (automática o manual): ni futura ni demasiado antigua. */
export function fechaConsumoInvalida(consumoMs: number, ahoraMs: number): string | null {
  if (!Number.isFinite(consumoMs)) return "Fecha y hora de consumo con formato inválido.";
  if (consumoMs > ahoraMs + TOLERANCIA_FUTURO_MIN * 60_000) return "La fecha y hora del consumo no pueden estar en el futuro.";
  if (consumoMs < ahoraMs - ANTIGUEDAD_MAX_HORAS * 3_600_000) return `El consumo no puede ser anterior a ${ANTIGUEDAD_MAX_HORAS} horas.`;
  return null;
}

export interface ConsumoLite { productId: string; consumidoMs: number }
export function ultimoConsumo(consumos: ConsumoLite[], productId: string): number | null {
  const l = consumos.filter(c => c.productId === productId).map(c => c.consumidoMs);
  return l.length ? Math.max(...l) : null;
}

export type EstadoResena = "sin_consumo" | "puede_publicar" | "puede_actualizar" | "bloqueada";
/** Regla central: se puede actualizar SOLO si fecha_ultimo_consumo > fecha_ultima_reseña. */
export function estadoResena(ultimoConsumoMs: number | null, resena: { status: string; lastReviewedMs: number } | null): EstadoResena {
  if (ultimoConsumoMs === null) return "sin_consumo";
  if (!resena) return "puede_publicar";
  const hayConsumoNuevo = ultimoConsumoMs > resena.lastReviewedMs;
  if (resena.status === "deleted") return hayConsumoNuevo ? "puede_publicar" : "bloqueada";
  if (resena.status === "published" || resena.status === "pending") return hayConsumoNuevo ? "puede_actualizar" : "bloqueada";
  return "bloqueada"; // oculta por moderación u otro estado
}

export function estadoTicketTexto(t: TicketLite, ahoraMs: number): "cancelado" | "vencido" | "lleno" | "activo" {
  if (t.status !== "active") return "cancelado";
  if (ahoraMs > t.expiresAtMs) return "vencido";
  return t.uses >= t.maxUses ? "lleno" : "activo";
}

/** Texto de un producto con su cantidad: "2× Capuchino". */
export const lineaProducto = (i: { name: string; qty?: number }) => ((i.qty ?? 1) > 1 ? `${i.qty}× ${i.name}` : i.name);

export type FiltroFecha = "hoy" | "ayer" | "7d" | "todo" | "rango";
/** Intervalo [inicio, fin) en milisegundos según la zona horaria del navegador. "hoy" es el valor por defecto del historial del cajero. */
export function rangoFiltro(f: FiltroFecha, ahora: Date, desde = "", hasta = ""): [number, number] {
  const DIA = 86_400_000, hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  if (f === "hoy") return [hoy, hoy + DIA];
  if (f === "ayer") return [hoy - DIA, hoy];
  if (f === "7d") return [hoy - 6 * DIA, hoy + DIA];
  if (f === "rango") return [desde ? new Date(`${desde}T00:00:00`).getTime() : -Infinity, hasta ? new Date(`${hasta}T00:00:00`).getTime() + DIA : Infinity];
  return [-Infinity, Infinity];
}
/** Foro: para publicar o comentar hay que haber canjeado al menos un ticket. Moderadores y administradores quedan exentos (moderan el contenido). */
export const ROLES_SIN_TICKET = ["moderator", "admin"];
export const necesitaTicketParaForo = (rol: string) => !ROLES_SIN_TICKET.includes(rol);
export const MSG_FORO = "Para participar en el foro necesitas haber canjeado al menos un ticket de consumo.";
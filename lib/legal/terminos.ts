/** Cuándo se le pide a una persona aceptar los términos. Código PURO (lo usa el cliente). */
export const RUTAS_LEGALES = ["/terminos", "/privacidad"];

/** Solo a cuentas activas que no aceptaron la versión vigente, y NUNCA en las propias páginas legales: así se pueden leer antes de aceptar. */
export function debePedirTerminos(perfil: { status: string; terminosVersion?: string } | null, ruta: string | null, version: string): boolean {
  if (!perfil || perfil.status !== "active" || perfil.terminosVersion === version) return false;
  const r = ruta ?? "";
  return !RUTAS_LEGALES.some(l => r === l || r.startsWith(`${l}/`));
}
/** Agrupación y promedios de reseñas por producto. Código PURO: lo usa la página de reseñas. */
export interface ResenaLite { id: string; productId?: string; product: string; rating: number; content: string; createdMs: number }
export interface ProductoLite { id: string; name: string; available: boolean }
export interface GrupoProducto { clave: string; nombre: string; promedio: number; total: number; resenas: ResenaLite[]; existe: boolean; disponible: boolean }

export const promedio = (rs: { rating: number }[]) => (rs.length ? Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10 : 0);

/** Las N mejor calificadas; a igual calificación gana la más completa y, luego, la más reciente. */
export function destacadas(rs: ResenaLite[], n = 4): ResenaLite[] {
  return [...rs].sort((a, b) => b.rating - a.rating || b.content.length - a.content.length || b.createdMs - a.createdMs).slice(0, n);
}

const norm = (s: string) => s.trim().toLowerCase();
/**
 * Un grupo por producto del menú (también los que aún no tienen reseñas). Las reseñas antiguas, sin productId, se asocian por nombre.
 * Si un producto ya no existe en el menú, sus reseñas se conservan en un grupo marcado como no disponible.
 */
export function agruparPorProducto(rs: ResenaLite[], menu: ProductoLite[]): GrupoProducto[] {
  const porId = new Map(menu.map(m => [m.id, m])), porNombre = new Map(menu.map(m => [norm(m.name), m]));
  const grupos = new Map<string, GrupoProducto>();
  for (const m of menu) grupos.set(m.id, { clave: m.id, nombre: m.name, promedio: 0, total: 0, resenas: [], existe: true, disponible: m.available });
  for (const r of rs) {
    const m = (r.productId && porId.get(r.productId)) || porNombre.get(norm(r.product));
    const clave = m ? m.id : `ya-no-existe:${norm(r.product)}`;
    if (!grupos.has(clave)) grupos.set(clave, { clave, nombre: r.product, promedio: 0, total: 0, resenas: [], existe: false, disponible: false });
    grupos.get(clave)!.resenas.push(r);
  }
  const lista = Array.from(grupos.values());
  for (const g of lista) { g.total = g.resenas.length; g.promedio = promedio(g.resenas); g.resenas.sort((a, b) => b.createdMs - a.createdMs); }
  return lista.sort((a, b) => (b.total > 0 ? 1 : 0) - (a.total > 0 ? 1 : 0) || b.promedio - a.promedio || b.total - a.total || a.nombre.localeCompare(b.nombre));
}
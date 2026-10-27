/** Entropía de Shannon (en bits) de una lista de valores agrupados en "cajas" de ancho fijo. 0 = totalmente predecible; más alto = más variado. */
export function entropia(valores: number[], ancho: number): number {
  if (valores.length < 2) return 0;
  const cuentas = new Map<number, number>();
  for (const v of valores) { const c = Math.floor(v / ancho); cuentas.set(c, (cuentas.get(c) ?? 0) + 1); }
  let h = 0;
  for (const n of cuentas.values()) { const p = n / valores.length; h -= p * Math.log2(p); }
  return Math.round(h * 100) / 100;
}

/** Entropía de las DIRECCIONES de un trazo de ratón (16 sectores, con 0° en el CENTRO de un sector para que las líneas rectas horizontales y
 *  verticales no queden partidas entre dos). Una línea recta o un patrón repetido dan valores bajos; una mano humana, valores altos. */
export function entropiaDirecciones(puntos: { x: number; y: number }[]): number {
  const sectores: number[] = [];
  for (let i = 1; i < puntos.length; i++) {
    const dx = puntos[i].x - puntos[i - 1].x, dy = puntos[i].y - puntos[i - 1].y;
    if (Math.hypot(dx, dy) >= 2) sectores.push(Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 16 + 0.5) % 16);
  }
  return entropia(sectores, 1);
}
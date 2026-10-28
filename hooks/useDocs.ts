"use client";
import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, query, QueryConstraint } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

/** Caché en memoria SOLO para colecciones completas y públicas (sin filtros, p. ej. menú y promociones): al volver a una página se pinta
 *  al instante y se actualiza en segundo plano. Las consultas con filtros no se guardan. */
const cache = new Map<string, any[]>();

/** Lee una colección (solo lectura, protegida por reglas). Devuelve data=null mientras carga. */
export function useDocs<T>(col: string, ...constraints: QueryConstraint[]) {
  const clave = constraints.length === 0 ? col : null;
  const [data, setData] = useState<T[] | null>(() => (clave ? (cache.get(clave) as T[] | undefined) ?? null : null));
  const [error, setError] = useState(""), [tick, setTick] = useState(0);
  useEffect(() => {
    setError("");
    let vivo = true;
    getDocs(query(collection(db, col), ...constraints))
      .then(s => { const filas = s.docs.map(d => ({ id: d.id, ...d.data() })); if (clave) cache.set(clave, filas); if (vivo) setData(filas as T[]); })
      .catch(() => { if (vivo) setError("No pudimos cargar la información. Revisa tu conexión e inténtalo de nuevo."); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col, tick]);
  return { data, error, reload: useCallback(() => setTick(t => t + 1), []) };
}
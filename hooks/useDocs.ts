"use client";
import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, query, QueryConstraint } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
/** Lee una colección (solo lectura, protegida por reglas). Devuelve data=null mientras carga. */
export function useDocs<T>(col: string, ...constraints: QueryConstraint[]) {
  const [data, setData] = useState<T[] | null>(null), [error, setError] = useState(""), [tick, setTick] = useState(0);
  useEffect(() => {
    setError("");
    getDocs(query(collection(db, col), ...constraints))
      .then(s => setData(s.docs.map(d => ({ id: d.id, ...d.data() }) as T)))
      .catch(() => setError("No pudimos cargar la información. Revisa tu conexión e inténtalo de nuevo."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col, tick]);
  return { data, error, reload: useCallback(() => setTick(t => t + 1), []) };
}

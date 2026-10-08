"use client";
/**
 * Defensa de DOM dinámico: los elementos clave se marcan con un atributo cuyo NOMBRE rota cada hora (data-x<sal>="menu-item").
 * Un scraper con selectores fijos deja de funcionar al rotar; uno adaptativo lee la sal en <body data-ds> y sigue funcionando
 * (lo que hace nuestro extractor autorizado). Ver docs/ANALISIS_ANTIBOT.md para el análisis costo/beneficio.
 */
import { createContext, ReactNode, useContext } from "react";
const Ctx = createContext("x0");
export const DomProvider = ({ salt, children }: { salt: string; children: ReactNode }) => <Ctx.Provider value={salt}>{children}</Ctx.Provider>;
export function useDom() { const salt = useContext(Ctx); return (name: string): Record<string, string> => ({ [`data-${salt}`]: name }); }

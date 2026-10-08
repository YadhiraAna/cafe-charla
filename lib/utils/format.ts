import type { Ts } from "@/types";
export const money = (n: number) => `$${n.toFixed(2)}`;
export const fmtDate = (t?: Ts) => (t ? new Date(t.seconds * 1000).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "");
export const today = () => new Date().toISOString().slice(0, 10);
export const byDateDesc = <T extends { createdAt?: Ts }>(a: T, b: T) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);

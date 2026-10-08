import { ReactNode } from "react";

export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return <p role="status" className="py-10 text-center text-espresso/70"><span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-caramelo border-t-transparent align-[-2px]" />{label}</p>;
}
/** Mensajes de error (assertive) y éxito (polite) para lectores de pantalla. */
export function Status({ error, done }: { error?: string; done?: string }) {
  if (error) return <p role="alert" className="rounded-md border border-rojo/40 bg-rojo/10 px-3 py-2 text-sm text-rojo">{error}</p>;
  if (done) return <p role="status" className="rounded-md border border-musgo/40 bg-musgo/10 px-3 py-2 text-sm text-musgo">{done}</p>;
  return null;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="card py-10 text-center"><p className="font-display text-xl">{title}</p>{children && <div className="mt-2 text-espresso/70">{children}</div>}</div>;
}
export function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-1"><label htmlFor={id} className="block text-sm font-semibold">{label}</label>{children}{hint && <p className="text-xs text-espresso/60">{hint}</p>}</div>;
}
export function PageHead({ title, lead, action }: { title: string; lead?: string; action?: ReactNode }) {
  return <header className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-4xl">{title}</h1>{lead && <p className="mt-2 max-w-prose text-espresso/75">{lead}</p>}</div>{action}</header>;
}
export function Stars({ value }: { value: number }) {
  return <span role="img" aria-label={`${value} de 5 estrellas`} className="text-caramelo">{"★".repeat(value)}{"☆".repeat(5 - value)}</span>;
}

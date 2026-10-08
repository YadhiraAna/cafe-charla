/** Etiqueta de estado. El significado nunca depende solo del color: siempre lleva texto. */
const TONE: Record<string, string> = {
  published: "bg-musgo/15 text-musgo", success: "bg-musgo/15 text-musgo", active: "bg-musgo/15 text-musgo", yes: "bg-musgo/15 text-musgo",
  pending: "bg-caramelo/20 text-[#7A4510]", denied: "bg-caramelo/20 text-[#7A4510]",
  hidden: "bg-rojo/10 text-rojo", error: "bg-rojo/10 text-rojo", disabled: "bg-rojo/10 text-rojo", no: "bg-espresso/10 text-espresso",
};
const LABEL: Record<string, string> = { published: "Publicado", pending: "Pendiente", hidden: "Oculto", success: "Éxito", error: "Error", denied: "Denegado", active: "Activo", disabled: "Desactivado", yes: "Sí", no: "No" };
export default function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${TONE[value] ?? "bg-espresso/10"}`}>{label ?? LABEL[value] ?? value}</span>;
}

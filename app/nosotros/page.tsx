import { PageHead } from "@/components/ui";
export const metadata = { title: "Nosotros" };
export default function About() {
  return (
    <>
      <PageHead title="Nosotros" />
      <div className="max-w-prose space-y-4 text-lg leading-relaxed">
        <p>Café &amp; Charla nació con una idea simple: que tomar un café sea la excusa para quedarse a conversar. Tostamos en pequeños lotes y horneamos cada mañana.</p>
        <p>Trabajamos con productores de Veracruz y Chiapas, y pagamos por encima del precio de mercado. En la barra encontrarás desde espresso clásico hasta bebidas de temporada.</p>
        <p>El foro de este sitio es la extensión de nuestra mesa larga: comparte recetas, recomienda lugares o cuéntanos qué tomaste hoy.</p>
      </div>
    </>
  );
}

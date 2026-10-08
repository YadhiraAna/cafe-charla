import { PageHead } from "@/components/ui";
export const metadata = { title: "Contacto" };
export default function Contact() {
  return (
    <>
      <PageHead title="Contacto" lead="Escríbenos o llámanos, respondemos en menos de un día hábil." />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="card space-y-3"><h2 className="text-2xl">Correo</h2><p>Para pedidos grandes, eventos y comentarios.</p><a className="btn-primary" href="mailto:hola@cafecharla.example">hola@cafecharla.example</a></div>
        <div className="card space-y-3"><h2 className="text-2xl">Teléfono</h2><p>De lunes a domingo, en horario de atención.</p><a className="btn-ghost" href="tel:+522220000000">222 000 0000</a></div>
      </div>
    </>
  );
}

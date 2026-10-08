import { PageHead } from "@/components/ui";
export const metadata = { title: "Ubicación" };
export default function Location() {
  return (
    <>
      <PageHead title="Ubicación" lead="Estamos en el centro, a dos cuadras de la plaza principal." />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="card space-y-2"><h2 className="text-2xl">Dirección</h2><p>Calle de los Tostadores 24, Col. Centro<br />Puebla, Puebla, México</p><h2 className="pt-3 text-2xl">Horario</h2><ul><li>Lunes a viernes: 7:00 a 20:00</li><li>Sábado y domingo: 8:00 a 21:00</li></ul></div>
        <div className="card space-y-3"><h2 className="text-2xl">Cómo llegar</h2><p>Cerca de las rutas de transporte público del centro. Hay estacionamiento para bicicletas en la entrada.</p>
          <a className="btn-primary" href="https://www.openstreetmap.org/search?query=Puebla%20centro" target="_blank" rel="noopener noreferrer">Abrir en OpenStreetMap</a></div>
      </div>
    </>
  );
}

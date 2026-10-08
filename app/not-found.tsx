import Link from "next/link";
export default function NotFound() {
  return <div className="py-16 text-center"><h1 className="text-4xl">Página no encontrada</h1><p className="mt-3">La dirección que buscas no existe o fue movida.</p><Link href="/" className="btn-primary mt-6">Volver al inicio</Link></div>;
}

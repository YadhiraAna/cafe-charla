import Link from "next/link";
export const metadata = { title: "Acceso denegado" };
export default function Forbidden() {
  return <div className="py-16 text-center"><h1 className="text-4xl">Acceso denegado</h1><p className="mt-3">Tu cuenta no tiene permiso para ver esta sección.</p><Link href="/" className="btn-primary mt-6">Volver al inicio</Link></div>;
}

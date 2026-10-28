import Link from "next/link";

/** Aviso para quien intenta participar en el foro sin haber canjeado ningún ticket. */
export default function AvisoTicket() {
  return (
    <div className="card space-y-2" role="status">
      <p className="font-display text-xl">Necesitas un ticket para participar</p>
      <p className="text-sm">El foro es para quienes ya nos visitaron: canjea el ticket de tu consumo (el código está en tu ticket o en su QR) y podrás publicar y comentar.</p>
      <Link href="/canjear" className="btn-primary">Canjear ticket</Link>
    </div>
  );
}
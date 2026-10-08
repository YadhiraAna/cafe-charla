import Link from "next/link";
export default function Footer() {
  return (
    <footer className="mt-16 border-t border-espresso/15 bg-espuma">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-espresso/70">
        <p>© {new Date().getFullYear()} Café &amp; Charla. Cafetería ficticia, proyecto académico.</p>
        <nav aria-label="Pie de página" className="flex gap-4"><Link href="/menu">Menú</Link><Link href="/foro">Foro</Link><Link href="/contacto">Contacto</Link></nav>
      </div>
    </footer>
  );
}

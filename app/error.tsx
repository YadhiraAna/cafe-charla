"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <div className="py-16 text-center" role="alert"><h1 className="text-4xl">Algo salió mal</h1><p className="mt-3">No pudimos mostrar esta página. Inténtalo de nuevo.</p><button className="btn-primary mt-6" onClick={reset}>Reintentar</button></div>;
}

import { PageHead } from "@/components/ui";
import { TERMINOS_VERSION } from "@/lib/antibot/config";

export const metadata = { title: "Aviso de privacidad y cookies" };

const COOKIES: [string, string, string, string][] = [
  ["ab_sid", "Seguridad contra bots y límites de peticiones (identificador aleatorio firmado)", "30 días", "Todas las personas"],
  ["sesion", "Mantener tu sesión iniciada (cookie httpOnly de Firebase)", "5 días", "Solo con sesión iniciada"],
  ["actividad", "Medir la inactividad y cerrar tu sesión (httpOnly, firmada)", "1 día", "Solo con sesión iniciada"],
  ["aviso_cookies", "Recordar que viste el aviso de cookies", "180 días", "Todas las personas"],
];

export default function Privacidad() {
  return (
    <>
      <PageHead title="Aviso de privacidad y cookies" lead={`Versión ${TERMINOS_VERSION}. Texto de ejemplo para un proyecto académico; no constituye asesoría legal.`} />
      <div className="max-w-prose space-y-6 leading-relaxed">
        <section><h2 className="text-2xl">1. Datos que tratamos</h2><p className="mt-1">Cuenta (nombre, correo, rol, foto opcional), contenido que publicas (foro, comentarios, reseñas), tus tickets canjeados y el historial de consumo, y registros de seguridad (fecha, acción, IP enmascarada y resultado). Nunca guardamos tu contraseña: la gestiona Firebase Authentication.</p></section>
        <section><h2 className="text-2xl">2. Para qué los usamos</h2><p className="mt-1">Para operar el sitio, validar que reseñas lo que consumiste, moderar contenido y proteger el servicio contra abusos y bots. No vendemos datos ni mostramos publicidad.</p></section>
        <section><h2 className="text-2xl">3. Huella técnica del navegador</h2><p className="mt-1">Para distinguir personas de programas automáticos medimos características técnicas de tu navegador (objetos de automatización, tiempos de carga, tipo de gráficos, fuentes disponibles, hardware, tiempos y patrones de teclado y ratón). Nunca guardamos lo que escribes ni qué teclas pulsas. Solo conservamos un resumen corto (hash) en los registros de seguridad, y únicamente con fines de seguridad.</p></section>
        <section id="cookies"><h2 className="text-2xl">4. Cookies</h2><p className="mt-1">Todas las cookies son <strong>esenciales</strong>: no usamos cookies de publicidad ni de análisis de terceros.</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="sr-only">Cookies del sitio</caption>
            <thead><tr className="border-b border-espresso/30">{["Cookie", "Para qué sirve", "Duración", "Quién la recibe"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{COOKIES.map(c => <tr key={c[0]} className="border-b border-espresso/10 align-top"><th scope="row" className="p-2">{c[0]}</th><td className="p-2">{c[1]}</td><td className="p-2">{c[2]}</td><td className="p-2">{c[3]}</td></tr>)}</tbody></table></div>
        </section>
        <section><h2 className="text-2xl">5. Almacenamiento local</h2><p className="mt-1">Firebase guarda tu sesión en el almacenamiento del navegador (IndexedDB); además usamos <code>localStorage</code> para una marca de actividad entre pestañas y <code>sessionStorage</code> para un aviso por pestaña. Al cerrar sesión se borran.</p></section>
        <section><h2 className="text-2xl">6. Terceros</h2><p className="mt-1">Usamos Google Firebase (cuentas y base de datos), Cloudinary (imágenes) y el servicio de alojamiento. Cada uno trata los datos según sus propias políticas.</p></section>
        <section><h2 className="text-2xl">7. Conservación y tus derechos</h2><p className="mt-1">Conservamos los datos mientras tu cuenta exista y los registros de seguridad mientras sean necesarios para la auditoría del proyecto. Puedes pedir acceso, corrección o eliminación desde la página de Contacto.</p></section>
      </div>
    </>
  );
}
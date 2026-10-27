import { PageHead } from "@/components/ui";
import { TERMINOS_VERSION } from "@/lib/antibot/config";

export const metadata = { title: "Términos y condiciones" };

const SECCIONES: [string, string][] = [
  ["1. Aceptación", "Al registrarte o usar Café & Charla aceptas estos términos y el Aviso de privacidad y cookies. Si no estás de acuerdo, no uses el sitio. Este es un proyecto académico y la cafetería es ficticia."],
  ["2. Cuentas", "Debes dar un correo real: se verifica que el dominio exista y te enviamos un enlace de confirmación; sin confirmarlo no podrás iniciar sesión. Eres responsable de tu contraseña y de lo que ocurra con tu cuenta. Puedes pedir su cierre en cualquier momento."],
  ["3. Uso aceptable", "No debes publicar contenido ilegal, ofensivo o que suplante a otras personas, ni intentar vulnerar el sitio. Los moderadores pueden ocultar o eliminar contenido que incumpla estas reglas."],
  ["4. Foro y comentarios", "Eres autor de lo que publicas y nos autorizas a mostrarlo en el sitio. Puedes editar o eliminar lo tuyo. El contenido se muestra como texto plano."],
  ["5. Tickets de consumo y reseñas", "Solo puedes reseñar un producto que consumiste: el cajero genera un ticket y tú lo canjeas con su código o QR. Cada ticket caduca, puede canjearse una sola vez por cuenta y hasta el número de personas indicado. Se permite una reseña por producto; para actualizarla debe existir un consumo posterior de ese producto."],
  ["6. Seguridad y automatización", "Para protegernos de bots usamos CAPTCHA, límites de peticiones, análisis de comportamiento y una huella técnica del navegador (ver Aviso de privacidad). Queda prohibido el uso de programas automáticos, scrapers o bots sin autorización escrita. Podemos rechazar o limitar peticiones sospechosas."],
  ["7. Sesión e inactividad", "Por tu seguridad cerramos tu sesión tras un periodo sin actividad (15 minutos para usuarios; 10 para personal), avisándote antes. Lo que no hayas enviado en un formulario se pierde; los datos ya guardados no se borran."],
  ["8. Propiedad intelectual", "El diseño y el código del sitio pertenecen a sus autores. Las marcas y productos mostrados son ficticios."],
  ["9. Limitación de responsabilidad", "El sitio se ofrece tal cual, sin garantías, y puede interrumpirse. No respondemos por daños derivados de su uso, salvo lo que la ley no permita excluir."],
  ["10. Cambios", "Podemos actualizar estos términos. Cada versión tiene un identificador; si cambia, te pediremos aceptarla de nuevo al iniciar sesión."],
  ["11. Contacto", "Escríbenos desde la página de Contacto."],
];

export default function Terminos() {
  return (
    <>
      <PageHead title="Términos y condiciones" lead={`Versión ${TERMINOS_VERSION}. Texto de ejemplo para un proyecto académico; no constituye asesoría legal.`} />
      <div className="max-w-prose space-y-6 leading-relaxed">
        {SECCIONES.map(([t, p]) => <section key={t}><h2 className="text-2xl">{t}</h2><p className="mt-1">{p}</p></section>)}
      </div>
    </>
  );
}
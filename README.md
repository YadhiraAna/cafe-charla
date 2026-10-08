# Café & Charla

Proyecto académico con presupuesto $0: sitio de una cafetería ficticia con menú, promociones, foro, reseñas, roles, auditoría y un módulo Selenium cuyos datos se usan en un panel de análisis.

## 1. Tecnologías
Next.js 14 (App Router) · TypeScript · React · Tailwind CSS · Firebase Authentication · Cloud Firestore · Cloudinary (imágenes) · Python + Selenium · Zod (validación).

## 2. Requisitos
Node.js 20.6+, Python 3.10+, Google Chrome, cuenta gratuita de Firebase (plan Spark) y de Cloudinary. **No se usa Firebase Storage ni ningún servicio de pago ni tarjeta.**

## 3. Instalación
```bash
npm install
cp .env.local.example .env.local   # completa los valores (sección 10)
npm run dev                         # http://localhost:3000
```

## 4. Firebase
1. Crea un proyecto en la consola de Firebase (sin Google Analytics).
2. Configuración del proyecto → Tus apps → Web: copia las claves `NEXT_PUBLIC_FIREBASE_*`.
3. Configuración → Cuentas de servicio → "Generar nueva clave privada": usa `project_id`, `client_email` y `private_key` para `FIREBASE_ADMIN_*` (el archivo JSON **no** se sube al repositorio).

## 5. Authentication
Activa **Correo electrónico/contraseña**. Registro y login pasan por el servidor para exigir CAPTCHA: el cliente solo completa con `signInWithCustomToken`.

## 6. Firestore
Crea la base de datos (modo producción) y publica las reglas: `firebase deploy --only firestore:rules` (con Firebase CLI) o pega `firestore.rules` en la consola. No se necesitan índices compuestos.

| Colección | Campos principales |
|---|---|
| `users/{uid}` | uid, name, email, role (`user`/`moderator`/`admin`), photoURL, photoPublicId, status, createdAt, updatedAt, lastLoginAt |
| `posts` | authorId, authorName, title, content, imageUrl, imagePublicId, status (`published`/`pending`/`hidden`), createdAt, updatedAt |
| `comments` | postId, authorId, authorName, content, status, createdAt, updatedAt |
| `reviews/{uid}` | authorId, authorName, rating 1-5, product, content, status, createdAt, updatedAt (una por usuario) |
| `menu` | name, description, category, size, price, imageUrl, imagePublicId, available, createdAt, updatedAt |
| `promotions` | title, description, imageUrl, imagePublicId, discount, startDate, endDate, active, createdAt, updatedAt |
| `logs` | userId, userName, userRole, action, module, targetType, targetId, status, description, timestamp |
| `scraping_results` | executedAt, status, pagesVisited, productsFound, promotionsFound, postsFound, commentsFound, reviewsFound, imagesFound, linksFound, duration, outputFile, details |

La contraseña **nunca** se guarda en Firestore (vive solo en Firebase Auth).

## 7. Cloudinary
Cuenta gratuita → Dashboard: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Las subidas pasan por `/api/upload` (servidor): sesión obligatoria, solo JPG/PNG/WEBP, máx. 2 MB, se verifica el contenido real del archivo y se rechaza SVG. Firestore guarda solo `imageUrl` y `publicId`; al eliminar o reemplazar, la imagen se borra de Cloudinary. El secreto nunca llega al navegador.

## 8. CAPTCHA (5 tipos, validados en el servidor)
Registro: texto · Login: matemático · Nueva publicación: imágenes · Comentario: pregunta · Reseña: selección. Cada reto va firmado (HMAC con `CAPTCHA_SECRET`), expira a los 5 minutos, es de un solo uso y permite 3 intentos. Los contadores están en memoria (válido para ejecución local; en producción usar Firestore o Redis). El CAPTCHA de texto es visual y puede ser difícil con lector de pantalla: hay botón para regenerarlo.

## 9. Otras capas de seguridad
(1) Reglas de Firestore: **todas** las escrituras de cliente están denegadas; (2) autorización por rol en el servidor leyendo `users/{uid}`; (3) validación con Zod que descarta campos desconocidos; (4) texto plano en React (sin `dangerouslySetInnerHTML`) contra XSS; (5) cabeceras HTTP de seguridad; (6) mensajes genéricos en login/recuperación; (7) App Check opcional.

### App Check (opcional)
**Para qué sirve:** Firebase solo acepta peticiones de tu app legítima, no de scripts externos. **Protege:** Firestore y Authentication desde el cliente. **Configurar:** consola → App Check → registra la app web con reCAPTCHA v3 (gratis) → pon la site key en `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (y la secret en `RECAPTCHA_SECRET_KEY`). **Probar en local:** en la consola del navegador ejecuta `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` antes de cargar, copia el token de depuración que aparece y regístralo en App Check → Administrar tokens de depuración. Sin site key, App Check no se activa y no bloquea el desarrollo. Actívalo en modo "enforce" solo cuando todo funcione.

## 10. Variables de entorno
**Públicas** (llegan al navegador, no son secretas): `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`.
**Privadas** (solo servidor, nunca con prefijo `NEXT_PUBLIC_`): `FIREBASE_ADMIN_*`, `CLOUDINARY_*`, `RECAPTCHA_SECRET_KEY`, `CAPTCHA_SECRET`, `SCRAPER_API_KEY`, `SEED_PASSWORD`. Genera `CAPTCHA_SECRET` y `SCRAPER_API_KEY` con `openssl rand -hex 32`.

## 11. Datos iniciales y primer administrador
`npm run seed` crea 3 cuentas demo (`usuario@`, `moderador@` y `admin@cafecharla.example`, contraseña = `SEED_PASSWORD`), 9 productos, 3 promociones, 3 publicaciones, 6 comentarios y 5 reseñas. Es repetible. Nadie puede hacerse admin desde la app: el primer admin sale del seed (o cambiando `role` a mano en la consola de Firestore).

## 12. Roles y permisos
| Acción | Visitante | Usuario | Moderador | Admin |
|---|:-:|:-:|:-:|:-:|
| Ver contenido público (menú, promos, foro, reseñas) | ✓ | ✓ | ✓ | ✓ |
| Publicar / comentar / reseñar (con CAPTCHA) | | ✓ | ✓ | ✓ |
| Editar o eliminar lo propio | | ✓ | ✓ | ✓ |
| Ocultar, aprobar o eliminar contenido ajeno | | | ✓ | ✓ |
| Administrar menú y promociones | | | | ✓ |
| Gestionar usuarios y roles | | | | ✓ |
| Ver logs y análisis Selenium | | | | ✓ |

Un moderador solo edita su propio contenido; el ajeno solo lo modera. El admin no puede cambiar su propio rol ni estado.

## 13. Logs
Colección `logs`, escrita **solo** por el servidor (`lib/logs/logger.ts`); las reglas impiden crear, editar o borrar. Se registran: registro, login (éxito y fallo), logout, recuperación de contraseña, perfil y foto, cambios de rol/estado, publicaciones, comentarios, reseñas, moderación, menú, promociones y Selenium (inicio, resultado y finalización). Nunca se guardan contraseñas, tokens ni secretos. Consulta en `/admin/logs` (filtros, paginación, más reciente primero).

## 14. Selenium
Ver `selenium/README.md`. Resumen:
```bash
cd selenium && pip install -r requirements.txt
export SCRAPER_API_KEY=...        # igual que en .env.local
python extractor.py --base-url http://localhost:3000
```
Recorre las 8 páginas públicas y cada publicación del foro. Extrae title, h1-h3, p, a, img, ul/ol, meta y table, más productos, precios, categorías, promociones, publicaciones, comentarios y reseñas. No inicia sesión ni evade CAPTCHA.

## 15. Visualización de resultados
`/admin/analisis` (solo admin): tarjetas, verificaciones (menú con productos, promociones, publicaciones accesibles, h1, alt), productos por categoría, precios mín/máx/promedio, comparación con la extracción anterior, contraste Firestore vs. Selenium, contenido detectado e historial. Los archivos `selenium/output/resultado_extraccion.json|csv` quedan en tu equipo.

## 16. Límites de los planes gratuitos
Revisa las cuotas vigentes en la documentación oficial, pueden cambiar. Firebase Spark: Firestore con cuota diaria de lecturas/escrituras y 1 GiB de almacenamiento; Authentication con límite de usuarios activos y de correos de recuperación. Cloudinary free: créditos mensuales de almacenamiento/transformaciones/ancho de banda. `/admin/logs` carga 200 registros por vez para cuidar la cuota de lecturas.

## 17. Solución de problemas
- *"Falta CAPTCHA_SECRET"*: define la variable y reinicia `npm run dev`.
- *"Missing or insufficient permissions"*: publica `firestore.rules`; recuerda que las escrituras van por `/api`.
- *Login falla siempre*: la cuenta debe existir en Auth y su `users/{uid}` debe tener `status: "active"`.
- *Clave privada inválida*: conserva las comillas y los `\n` en `FIREBASE_ADMIN_PRIVATE_KEY`.
- *Imagen rechazada*: JPG/PNG/WEBP de hasta 2 MB y sin cambiar la extensión a mano.
- *Selenium "La ingesta no está configurada" (503)*: define `SCRAPER_API_KEY` (16+ caracteres) en `.env.local` y reinicia.
- *Selenium no abre Chrome*: instala Chrome y `pip install -r requirements.txt` (Selenium Manager baja el driver; requiere internet).
- *Las listas salen vacías*: ejecuta `npm run seed` o crea contenido desde el panel.

## 18. Defensa anti-bots y scrapers
Capas: telemetría de comportamiento, rate limiting por IP y sesión (HTTP 429 + `Retry-After`), CAPTCHA/token/honeypot validados en el servidor, atributos de DOM que rotan cada hora y detección de automatización (`navigator.webdriver`, User-Agent) con auditoría en `security_events` y `logs`. Panel: `/admin/seguridad`. Configuración: `lib/antibot/config.ts`. **Análisis completo (confiabilidad, falsos positivos, costo/beneficio): `docs/ANALISIS_ANTIBOT.md`.**

- El extractor Selenium se identifica con una cookie firmada (necesita `SCRAPER_API_KEY`); sin ella (`--anonymous`) el sitio lo detecta como bot.
- Pruebas: `python selenium/pruebas_antibot.py ratelimit|parallel|bot-form` (solo contra localhost).
- Publica de nuevo `firestore.rules` (nueva colección `security_events`, solo lectura para admin).
- Limitación: los contadores están en memoria; en producción con varias instancias usa Redis.

# Defensa contra bots y scrapers: implementación y análisis

Las defensas se aplican **en capas**: ninguna es infalible, pero cada una sube el costo del atacante y deja evidencia en `security_events` y `logs`. El panel `/admin/seguridad` concentra los resultados.

| # | Capa | Dónde vive | Qué detiene |
|---|---|---|---|
| 1 | Telemetría de comportamiento | `lib/antibot/client.ts` (recoge) · `score.ts` (decide, en el servidor) | Scripts que rellenan formularios sin interacción humana |
| 2 | Rate limiting | `lib/antibot/ratelimit.ts` · `guard.ts` | Ráfagas, múltiples pestañas, fuerza bruta |
| 3 | CAPTCHA + token de formulario + honeypot | `lib/captcha/server.ts` · `human.ts` | Envíos automáticos sin pasar por la interfaz |
| 4 | DOM dinámico | `lib/antibot/dom.ts` · `DomProvider.tsx` | Scrapers con selectores fijos |
| 5 | Fingerprint y auditoría | `Beacon.tsx` · `/api/antibot/fingerprint` · `events.ts` | Navegadores automatizados (`navigator.webdriver`, User-Agent) |

Flujo de un formulario protegido: `guard()` (429 si excede) → `requireHuman()`: cabeceras + fingerprint + biometría + honeypot + token de formulario → **puntaje 0-100** → ≥70 bloquea (403), 40-69 se permite y se audita → recién entonces se valida el CAPTCHA → lógica del negocio.

---

## 1. Telemetría y biometría de comportamiento

**Qué se mide** (solo tiempos y movimientos, nunca qué tecla se pulsó ni el contenido): movimientos de mouse (distancia, velocidad, linealidad, cambios de dirección), intervalos entre clics y entre teclas, caracteres insertados por segundo, pegados, saltos de foco, scroll, toques, tiempo hasta la primera interacción y edad del formulario.

**Cómo se decide:** el navegador solo envía números; el servidor los puntúa (`scoreBehavior`). Ejemplos: teclas con intervalo medio < 15 ms (`send_keys` de Selenium), tecleo con variación < 8 %, más de 25 caracteres por segundo sin pegar, clics sin ningún movimiento de mouse, trayectoria perfectamente recta, formulario sin ninguna interacción.

### Confiabilidad y margen de error
- **Fuerte:** velocidad de tecleo instantánea y ausencia total de interacción. Un humano no las produce.
- **Débil:** mouse y clics. Un bot puede simular curvas y pausas aleatorias (humanización); y hay humanos legítimos que no usan mouse (teclado, lector de pantalla, móvil).
- **Falsos positivos esperables (humanos marcados):**
  - *Gestores de contraseñas y autocompletado:* llenan campos sin teclear. Se mitiga porque `keys=0` por sí solo no puntúa y porque el envío exige al menos un clic o tecla.
  - *Pegar contraseñas:* se excluye de la regla de velocidad (`pastes>0`).
  - *Accesibilidad:* navegación solo con teclado o lector de pantalla → sin mouse. No penaliza si hay teclas.
  - *Usuarios muy rápidos o formularios repetidos tras un CAPTCHA fallido:* por eso el mínimo del servidor es 1 s, no más.
  - *Navegadores con protección anti-fingerprinting* (Tor, Firefox con RFP) reportan valores fijos y pueden sumar puntos.
- **Falsos negativos:** bots con movimiento humanizado, o que operan un navegador real con `AutomationControlled` desactivado. La telemetría **no reemplaza** al CAPTCHA ni al rate limit.
- **Cómo medirlo en este proyecto:** `/admin/seguridad` permite etiquetar cada evento bloqueado o sospechoso como "Bot" o "Humano" y calcula la **tasa de falsos positivos con intervalo de confianza de Wilson al 95 %**. Protocolo sugerido: 30 o más personas reales envían los formularios con distintos dispositivos y navegadores; se cuentan los eventos humanos. Con n pequeño el intervalo es ancho: no se debe afirmar una tasa sin reportarlo. Solo se miden falsos positivos; los falsos negativos no generan evento.
- **Umbrales** (`config.ts`): ≥70 bloquea, 40-69 solo audita. Bajar el umbral aumenta la captura de bots y los falsos positivos; subirlo hace lo contrario. El rango "sospechoso" existe para no bloquear con evidencia ambigua.

## 2. Control de tráfico y rate limiting

**Implementación:** token bucket (`ratelimit.ts`). Cada política (auth, captcha, write, user, beacon) define ráfaga y recarga (`config.ts`). Se aplica **por sesión** (cookie firmada `ab_sid`, HttpOnly) **y por IP**; basta que una de las dos cubetas se agote. Respuesta: **HTTP 429** con `Retry-After`, `X-RateLimit-Limit` y `X-RateLimit-Remaining`. Además hay límite por usuario autenticado y bloqueo temporal tras 8 fallos de login (por IP y por correo, 15 min).

### Peticiones paralelas y varias pestañas
- Las pestañas de una misma persona comparten la cookie → comparten cubeta. La **ráfaga** (por ejemplo 20) absorbe usos legítimos como abrir varias pestañas o doble clic, y la recarga lenta limita el tráfico sostenido.
- Un bot que abre muchas pestañas con **cookies distintas** (sesiones nuevas) no evade el límite: la cubeta **por IP** es compartida (3× la de sesión). Un bot que rota IP sí evade esta capa; ahí hacen falta CAPTCHA, telemetría y fingerprint.
- El comprobar y consumir es atómico (JavaScript monohilo), por lo que las peticiones simultáneas no "se cuelan" entre la comprobación y el consumo.

### Impacto en usuarios legítimos
- **Costo real de limitar por IP:** personas tras la misma red (universidad, oficina, NAT) comparten cubeta. Por eso la cubeta por IP es 3× mayor y el límite por sesión es el que protege la experiencia individual. `pruebas_antibot.py parallel` lo demuestra: mientras 8 "pestañas" saturan la IP, una persona legítima puede recibir 429.
- **Bloqueo por correo:** limita la fuerza bruta distribuida contra una cuenta, pero permite que un atacante bloquee 15 min a una víctima (DoS dirigido). Se acepta por su duración corta y porque no revela si la cuenta existe.
- **Limitaciones:** el estado está en memoria (se pierde al reiniciar y no se comparte entre instancias → en producción usar Redis). Detrás de un proxy, `x-forwarded-for` debe venir de un proxy de confianza o se puede falsificar.
- **Protección de cuota:** los eventos se deduplican (60 s) y se limitan a 300 por hora para que un ataque no agote las escrituras gratuitas de Firestore.

## 3. Desafíos de verificación (CAPTCHA y tokens)

- **Validación estrictamente en el servidor.** El navegador solo muestra el reto y envía la respuesta; la respuesta correcta nunca viaja al cliente (solo su hash HMAC dentro de un token firmado). El servidor verifica: firma, tipo de reto, caducidad (5 min), uso único y máximo 3 intentos.
- **Tokens invisibles adicionales** (sin fricción para la persona):
  - *Token de formulario:* firmado por el servidor, de un solo uso, con la hora de emisión. El **tiempo mínimo se mide en el servidor** (1 s): no se puede falsificar desde el navegador.
  - *Honeypot:* campo oculto que una persona nunca rellena. Riesgo de falso positivo: algunos autocompletadores lo llenan; se usa un nombre atípico y `autocomplete="off"`.
- **Por qué no puede evadirse desde el frontend:** si un atacante modifica el JavaScript, solo cambia los datos que envía; el servidor los evalúa de todos modos y un envío sin telemetría o sin token válido suma puntos o se bloquea.
- **Límites honestos:** el CAPTCHA de texto entrega el código al cliente para dibujarlo, así que un bot lo lee del JSON; los CAPTCHA propios son débiles frente a OCR/ML y a granjas de resolución humana. Para producción conviene reCAPTCHA/hCaptcha/Turnstile (también validados en servidor).

## 4. Defensa contra scraping y estructura dinámica (DOM)

- **Realidad de partida:** las páginas son un caparazón; los datos se cargan desde Firestore en el navegador, así que un scraper de HTML estático ve poco. Un scraper con navegador (Selenium) sí ve el DOM final.
- **Técnica aplicada:** los elementos clave se marcan con un atributo cuyo **nombre cambia cada hora** (`data-x3fa9c1d2="menu-item"`; sal = HMAC del periodo). Los selectores fijos (XPath/CSS escritos a mano) dejan de funcionar al rotar.
- **Conciencia de selectores:** el extractor oficial lee la sal de `<body data-ds>` en cada página y construye el selector en ese momento, por lo que **no se rompe** al rotar. Un atacante inteligente puede hacer lo mismo: esta técnica frena scrapers simples, no a los adaptativos.
- **Balance costo/beneficio:**
  - *Beneficio:* bajo para un atacante decidido; medio contra scripts baratos y tutoriales copiados.
  - *Costo de mantenimiento:* bajo aquí (un hook `useDom` y nombres semánticos estables), porque se rota el *nombre del atributo*, no la estructura. Rotar clases CSS o reordenar el DOM sería más eficaz pero rompe estilos, pruebas, accesibilidad y herramientas propias, con un costo continuo alto.
  - *Efectos secundarios:* rompe pruebas E2E con selectores fijos (hay que usar el hook) y no mejora la accesibilidad ni el SEO.
- **Conclusión:** sirve como una capa barata de fricción; la defensa de fondo contra el scraping de datos son las reglas de Firestore, el rate limit y la detección.

## 5. Detección de automatización (fingerprinting) y auditoría

- **Navegador:** `Beacon.tsx` envía una vez por pestaña `navigator.webdriver`, plugins, idiomas, presencia de `window.chrome`, tamaños de ventana y pantalla, y `userAgent`. Además, `requireHuman` vuelve a evaluarlos al enviar formularios.
- **Servidor:** inspecciona `User-Agent` (vacío, `curl`, `python-requests`, `HeadlessChrome`, `selenium`…), `Accept-Language` y la **coherencia** entre el UA de las cabeceras y el de JavaScript.
- **Extractor autorizado:** se identifica con una cookie firmada y con caducidad (derivada de `SCRAPER_API_KEY`). Queda registrado como `authorized_scraper` (visible en el panel), usa su propia política de rate limit y **nunca** envía formularios ni resuelve CAPTCHA. Con `--anonymous` se comporta como un bot cualquiera y debe aparecer como sospechoso.
- **Auditoría con los registros del servidor:** cada evento va a `security_events` (IP enmascarada + hash, UA, ruta, puntaje y señales) y a `logs` (módulo `security`). El panel muestra bloqueos, 429, bloqueos temporales, distribución de puntajes y los orígenes con más eventos, para detectar intentos de intrusión y fuerza bruta.
- **Evasiones conocidas:** `--disable-blink-features=AutomationControlled`, `undetected-chromedriver` o parches de stealth ocultan `navigator.webdriver`; los UA se falsifican. Por eso el fingerprint es **una señal más**, nunca la única.

---

## Cómo probarlo
1. `npm run dev`. En otra terminal: `cd selenium && python pruebas_antibot.py ratelimit` → se espera 429 con `Retry-After`.
2. `python pruebas_antibot.py parallel` → varias sesiones contra una IP; observa el impacto en la persona legítima.
3. `python pruebas_antibot.py bot-form` → Selenium rellena el login al instante; el sitio responde que no pudo verificar que eres una persona.
4. `python extractor.py --anonymous` → debe aparecer como sospechoso; sin esa opción y con `SCRAPER_API_KEY` aparece como extractor autorizado.
5. Revisa `/admin/seguridad` y `/admin/logs` (módulo `security`) y etiqueta los eventos para obtener la tasa de falsos positivos.

## Limitaciones generales
Estado en memoria (una sola instancia), IP de proxys sin verificar, detección basada en señales que un atacante con recursos puede falsear, ausencia de pruebas con tráfico real. Los umbrales y pesos son un punto de partida razonado, **no valores calibrados con datos**: calíbralos con el panel.

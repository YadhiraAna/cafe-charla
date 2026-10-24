# -*- coding: utf-8 -*-
"""
Auditoría de esquemas de protección y viabilidad de extracción.
Reutiliza GestorNavegador, analizar_bloqueo y utilidades del proyecto.

Clasifica cada sitio en nivel de protección BÁSICO / INTERMEDIO / AVANZADO
y calcula además un puntaje de viabilidad (técnica + contractual).

Solo DETECTA y documenta: no resuelve captchas ni evade bloqueos.
Hace ~3 peticiones por sitio + hasta 4 páginas clave (login, registro...).
"""

import re
import time
import urllib.error
import urllib.request
from datetime import datetime
from urllib.parse import urljoin, urlparse

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.by import By

import robots
from bloqueos import analizar_bloqueo
from utilidades import esperar_carga

# Identifícate honestamente y deja un contacto real
UA = "ProyectoAcademicoAuditoria/1.0 (contacto: tu_correo@universidad.mx)"

# Firmas de sistemas anti-bot (cabeceras, cookies y HTML).
# Nota: "cf-ray" NO está aquí: aparece en cualquier sitio detrás del CDN de Cloudflare.
FIRMAS = {
    "Cloudflare": ["cf_clearance", "__cf_bm", "challenge-platform", "cf-chl", "cf-mitigated"],
    "Akamai": ["akamai", "_abck", "ak_bmsc"],
    "PerimeterX/HUMAN": ["_px", "perimeterx", "px-captcha"],
    "DataDome": ["datadome"],
    "Imperva/Incapsula": ["incap_ses", "visid_incap"],
}
WAF_HUELLA = ("Akamai", "PerimeterX/HUMAN", "DataDome", "Imperva/Incapsula")

RE_TERMINOS = re.compile(r"terms|t[eé]rminos|condiciones|user-agreement|legal", re.I)
RE_API = re.compile(r"developers?\.|/developers?|/api\b|api\.", re.I)
RE_PAGINACION = re.compile(r"[?&](page|p|pagina|pg|offset)=\d+|/page/\d+|/pagina/\d+", re.I)
# Páginas donde suelen aparecer captchas (formularios), además de la home
RE_PAGINAS_CLAVE = re.compile(r"login|signin|sign-in|iniciar|registr|signup|sign-up|register|contact|checkout|cart|carrito", re.I)
MAX_PAGINAS_CLAVE = 4      # límite de páginas extra por sitio
PAUSA_ENTRE_PAGINAS = 2    # segundos
_ROBOTS = {}               # base -> RobotFileParser

REQUIERE = {
    "Básico": "Extracción directa con peticiones HTTP o Selenium básico.",
    "Intermedio": "Esperas explícitas (WebDriverWait) y soporte de ejecución de JavaScript.",
    "Avanzado": "API oficial o acceso autorizado: bloquea automatizaciones estándar.",
}

COLUMNAS_NUEVAS = {
    "captcha_paginas": "TEXT",
    "render_dinamico": "INTEGER",
    "scroll_infinito": "INTEGER",
    "paginacion_url": "INTEGER",
    "captcha_tipo": "TEXT",
    "nivel_proteccion": "TEXT",
    "senales_nivel": "TEXT",
    "requiere": "TEXT",
}


# ------------------------------------------------------------------ BD
def crear_tabla(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS auditoria_sitios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sitio TEXT NOT NULL,
            fecha TEXT NOT NULL,
            http_status INTEGER,
            robots TEXT,               -- presente / ausente / bloqueado
            robots_permite_home INTEGER,
            robots_bloquea_todo INTEGER,
            crawl_delay TEXT,
            protecciones TEXT,
            captcha_home TEXT,
            login_wall INTEGER,
            ratelimit_headers INTEGER,
            url_terminos TEXT,
            api_oficial TEXT,
            terminos_prohiben TEXT,    -- s / n / ? (lectura manual)
            datos_personales TEXT,     -- s / n / ? (criterio del equipo)
            puntaje INTEGER,
            viabilidad TEXT
        )
        """
    )
    # Migración: agrega las columnas que falten (tablas creadas con versiones anteriores)
    existentes = [r[1] for r in conn.execute("PRAGMA table_info(auditoria_sitios)")]
    for col, tipo in COLUMNAS_NUEVAS.items():
        if col not in existentes:
            conn.execute(f"ALTER TABLE auditoria_sitios ADD COLUMN {col} {tipo}")
    conn.commit()


# ------------------------------------------------------------------ Revisión técnica
def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, dict(r.headers), r.read(300_000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), ""
    except Exception:
        return None, {}, ""


def revisar_robots(base):
    """Devuelve (estado, permite_home, bloquea_todo, crawl_delay). La lectura la hace robots.py (compartido)."""
    estado, rp = robots.consultar(base, UA)
    if estado == "bloqueado":
        return "bloqueado", 0, 1, ""
    if estado != "presente":
        return "ausente", 1, 0, ""
    _ROBOTS[base] = rp
    permite_home = int(rp.can_fetch(UA, base + "/"))
    bloquea_todo = int(not rp.can_fetch(UA, base + "/") and not rp.can_fetch(UA, base + "/x"))
    return "presente", permite_home, bloquea_todo, str(rp.crawl_delay(UA) or "")


def _permitido(base, url):
    rp = _ROBOTS.get(base)
    return rp.can_fetch(UA, url) if rp else True


def detectar_protecciones(texto):
    texto = texto.lower()
    return [n for n, claves in FIRMAS.items() if any(c in texto for c in claves)]


def _palabras_html(html):
    """Cuenta palabras visibles en el HTML crudo (sin ejecutar JavaScript)."""
    limpio = re.sub(r"(?is)<script.*?</script>|<style.*?</style>|<[^>]+>", " ", html)
    return len(limpio.split())


def clasificar_captcha(html):
    """Identifica el tipo de captcha por las firmas del HTML. Devuelve lista de etiquetas."""
    h = html.lower()
    tipos = []
    if "challenges.cloudflare.com/turnstile" in h or "cf-turnstile" in h:
        tipos.append("Cloudflare Turnstile")
    if "hcaptcha" in h:
        tipos.append("hCaptcha")
    if "recaptcha" in h or "g-recaptcha" in h:
        # v3: se carga con render=<clave> (no "explicit") y no hay casilla visible
        v3 = bool(re.search(r"recaptcha/(?:enterprise|api)\.js\?[^\"'\s>]*render=(?!explicit)[\w-]{20,}", h))
        v2 = "g-recaptcha" in h or "api2/bframe" in h or "i'm not a robot" in h
        if v3:
            tipos.append("reCAPTCHA v3 (implícito)")
        if v2:
            tipos.append("reCAPTCHA v2")
        if not v2 and not v3:
            tipos.append("reCAPTCHA (versión no determinada)")
    return tipos


def detectar_scroll_infinito(driver):
    """Heurística: al bajar al fondo, ¿aparecen enlaces nuevos o crece la página?"""
    try:
        h1 = driver.execute_script("return document.body.scrollHeight")
        n1 = len(driver.find_elements(By.CSS_SELECTOR, "a[href]"))
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(2)
        h2 = driver.execute_script("return document.body.scrollHeight")
        n2 = len(driver.find_elements(By.CSS_SELECTOR, "a[href]"))
        return n2 >= n1 + 3 or h2 > h1 * 1.2
    except WebDriverException:
        return False


def clasificar_nivel(f, texto, headers_low):
    """Clasifica en Básico / Intermedio / Avanzado según los criterios del estudio."""
    avanzado, intermedio, basico = [], [], []

    # ---- AVANZADO: Cloudflare, reCAPTCHA v3 implícito, huella (JA3/TLS), WAF
    prot = f["protecciones"]
    if "Cloudflare" in prot:
        avanzado.append("Cloudflare (detección de bots activa)")
    for waf in WAF_HUELLA:
        if waf in prot:
            avanzado.append(f"WAF/huella de navegador: {waf}")
    if "Cloudflare Turnstile" in f["captcha_tipo"]:
        avanzado.append("Cloudflare Turnstile")
    if "v3" in f["captcha_tipo"]:
        avanzado.append("reCAPTCHA v3 implícito")
    if f["http_status"] in (403, 429, 503) and f["_palabras_js"] > 50:
        avanzado.append(f"HTTP simple bloqueado ({f['http_status']}) pero el navegador carga: posible huella TLS/JA3")

    # ---- INTERMEDIO: JS/React, paginación infinita, reCAPTCHA v2
    if f["render_dinamico"]:
        intermedio.append("renderizado dinámico (el contenido depende de JavaScript)")
    if f["scroll_infinito"]:
        intermedio.append("paginación infinita")
    if "v2" in f["captcha_tipo"] or "hCaptcha" in f["captcha_tipo"]:
        intermedio.append(f"captcha de casilla: {f['captcha_tipo']}")
    elif f["captcha_tipo"] == "reCAPTCHA (versión no determinada)":
        intermedio.append("reCAPTCHA (versión no determinada)")
    elif (f["captcha_home"] != "no" or f["captcha_paginas"] != "no") and not f["captcha_tipo"]:
        intermedio.append("captcha de tipo no identificado")

    # ---- BÁSICO: HTML estático, robots.txt estándar, paginación por URL
    if not f["render_dinamico"]:
        basico.append("HTML estático")
    if f["robots"] == "presente" and f["robots_permite_home"]:
        basico.append("robots.txt estándar")
    if f["paginacion_url"]:
        basico.append("paginación por URL")

    if avanzado:
        nivel, senales = "Avanzado", avanzado
    elif intermedio:
        nivel, senales = "Intermedio", intermedio
    else:
        nivel, senales = "Básico", basico or ["sin señales de protección"]

    # Informativo: Cloudflare solo como CDN (no cuenta como protección)
    if "cf-ray" in headers_low and "Cloudflare" not in prot:
        senales = senales + ["(info) detrás del CDN de Cloudflare, sin reto detectado"]
    return nivel, "; ".join(senales)


def auditar_tecnico(driver, base):
    fila = {"sitio": base, "fecha": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    (fila["robots"], fila["robots_permite_home"],
     fila["robots_bloquea_todo"], fila["crawl_delay"]) = revisar_robots(base)

    # HTTP simple: código de estado y cabeceras (lo que vería un script sin navegador)
    status, headers, html_http = _get(base)
    fila["http_status"] = status
    headers_low = {k.lower(): str(v).lower() for k, v in headers.items()}
    fila["ratelimit_headers"] = int(any("ratelimit" in k or k == "retry-after" for k in headers_low))

    # Selenium: lo que ve un navegador real (JS, cookies, captcha, login)
    driver.get(base)
    esperar_carga(driver)
    time.sleep(1)  # los widgets de captcha cargan de forma asíncrona
    html_js = driver.page_source
    cookies = " ".join(c["name"] for c in driver.get_cookies())
    texto = (str(headers_low) + " " + cookies + " " + html_http + " " + html_js).lower()

    fila["protecciones"] = ", ".join(detectar_protecciones(texto)) or "no detectadas"
    fila["captcha_home"] = " | ".join(analizar_bloqueo(driver)) or "no"
    fila["login_wall"] = int(
        bool(driver.find_elements(By.CSS_SELECTOR, "input[type=password]"))
        or bool(re.search(r"login|signin|sign-in|iniciar", driver.current_url, re.I)))

    enlaces = [a.get_attribute("href") or "" for a in driver.find_elements(By.CSS_SELECTOR, "a[href]")]
    fila["url_terminos"] = next((h for h in enlaces if RE_TERMINOS.search(h)), "no encontrada")
    fila["api_oficial"] = next((h for h in enlaces if RE_API.search(h)), "no detectada en home")

    # ---- Señales del estudio comparativo (en la home)
    palabras_http = _palabras_html(html_http)
    try:
        palabras_js = len(driver.find_element(By.TAG_NAME, "body").text.split())
    except WebDriverException:
        palabras_js = 0
    fila["_palabras_js"] = palabras_js
    # Dinámico: tras ejecutar JS hay mucho más texto que en el HTML crudo
    fila["render_dinamico"] = int(status == 200 and palabras_js > max(40, 2 * palabras_http))
    fila["paginacion_url"] = int(
        any(RE_PAGINACION.search(h) for h in enlaces)
        or bool(driver.find_elements(By.CSS_SELECTOR, "a[rel=next], link[rel=next]")))
    fila["scroll_infinito"] = int(detectar_scroll_infinito(driver))

    # ---- Páginas clave (login, registro, contacto...): ahí suelen salir los captchas
    dominio = urlparse(base).netloc
    candidatas = []
    for h in enlaces:
        u = urlparse(h)
        h = h.split("#")[0]
        if u.netloc == dominio and RE_PAGINAS_CLAVE.search(u.path) and h not in candidatas:
            candidatas.append(h)
    hallados, html_extra = [], ""
    for h in candidatas[:MAX_PAGINAS_CLAVE]:
        if not _permitido(base, h):
            continue  # respetar robots.txt
        time.sleep(PAUSA_ENTRE_PAGINAS)
        try:
            driver.get(h)
            esperar_carga(driver)
            time.sleep(1)
            motivos = analizar_bloqueo(driver)
            html_extra += " " + driver.page_source
        except WebDriverException:
            continue
        if motivos:
            hallados.append(f"{h} -> {motivos[0]}")
    fila["captcha_paginas"] = " ; ".join(hallados) or "no"
    fila["paginas_clave_revisadas"] = len(candidatas[:MAX_PAGINAS_CLAVE])

    # ---- Tipo de captcha y nivel de protección
    fila["captcha_tipo"] = ", ".join(clasificar_captcha(texto + " " + html_extra.lower()))
    fila["nivel_proteccion"], fila["senales_nivel"] = clasificar_nivel(
        fila, texto + " " + html_extra.lower(), headers_low)
    fila["requiere"] = REQUIERE[fila["nivel_proteccion"]]
    return fila


# ------------------------------------------------------------------ Viabilidad
def calcular_viabilidad(f):
    """Puntaje de riesgo: 0-2 Alta, 3-5 Media, 6-8 Baja, 9+ No recomendada."""
    p = 0
    p += 2 if f["robots_bloquea_todo"] or not f["robots_permite_home"] else 0
    p += 2 if f["protecciones"] != "no detectadas" else 0
    p += 2 if (f["captcha_home"] != "no" or f.get("captcha_paginas", "no") != "no") else 0
    p += 2 if f["login_wall"] else 0
    p += {"s": 3, "?": 1, "n": 0}.get(f["terminos_prohiben"], 1)
    p += 3 if f["datos_personales"] == "s" else 0
    nivel = "Alta" if p <= 2 else "Media" if p <= 5 else "Baja" if p <= 8 else "No recomendada"
    return p, nivel


def _preguntar(texto):
    while True:
        r = input(texto).strip().lower()
        if r in ("s", "n", "?"):
            return r
        print("  Responde s, n o ? (aún no revisado).")


def guardar(conn, f):
    datos = {k: v for k, v in f.items() if not k.startswith("_") and k != "paginas_clave_revisadas"}
    cols = ", ".join(datos)
    marcas = ", ".join("?" for _ in datos)
    with conn:
        conn.execute(f"INSERT INTO auditoria_sitios ({cols}) VALUES ({marcas})", list(datos.values()))


# ------------------------------------------------------------------ Flujo de menú
def auditar_sitios(conn, navegador, urls):
    crear_tabla(conn)
    driver = navegador.obtener()
    for url in urls:
        base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        print(f"\n[*] Auditando {base} ...")
        try:
            f = auditar_tecnico(driver, base)
        except WebDriverException as e:
            print(f"    [ERROR] {(e.msg or str(e)).splitlines()[0]}")
            continue

        print(f"    NIVEL DE PROTECCIÓN: {f['nivel_proteccion'].upper()}")
        print(f"    Señales: {f['senales_nivel']}")
        print(f"    Para extraer: {f['requiere']}")
        print(f"    robots.txt: {f['robots']} | protecciones: {f['protecciones']} | "
              f"captcha: {f['captcha_tipo'] or 'ninguno'}")
        print(f"    páginas clave revisadas: {f['paginas_clave_revisadas']} | "
              f"captcha en páginas clave: {f['captcha_paginas']}")
        print(f"    login wall: {bool(f['login_wall'])} | API: {f['api_oficial']}")
        print(f"    LEE los términos: {f['url_terminos']}")
        if f["url_terminos"] == "no encontrada":
            print("    (No se encontró enlace a términos: si no los has podido leer, responde ?)")
        f["terminos_prohiben"] = _preguntar("    ¿Los términos prohíben extracción automatizada? (s/n/?): ")
        f["datos_personales"] = _preguntar("    ¿Contiene datos personales el contenido a extraer? (s/n/?): ")
        f["puntaje"], f["viabilidad"] = calcular_viabilidad(f)
        guardar(conn, f)
        print(f"    => Nivel {f['nivel_proteccion']} | Viabilidad: {f['viabilidad']} (riesgo {f['puntaje']})")


def mostrar_auditorias(conn):
    crear_tabla(conn)
    filas = conn.execute(
        "SELECT sitio, nivel_proteccion, senales_nivel, viabilidad, puntaje "
        "FROM auditoria_sitios ORDER BY id").fetchall()
    print(f"\n===== AUDITORÍAS ({len(filas)}) =====")
    for s, n, se, v, p in filas:
        print(f"  {s}\n    Nivel: {n or 's/d'} | {se or ''}\n    Viabilidad: {v} ({p})")

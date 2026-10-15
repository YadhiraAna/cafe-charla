#!/usr/bin/env python3
"""
Bot de extracción: Selenium (navegación dinámica) → Pandas (limpieza) → SQLite (almacenamiento).

Ética: solo contenido público y autorizado, pausas entre páginas, respeta robots.txt, y NO evade CAPTCHA, antibots ni bloqueos:
si aparece una verificación humana se detiene y espera a que una PERSONA la resuelva en la ventana (con límite de tiempo);
si el sitio bloquea el acceso, termina.

Uso (desde la carpeta selenium, con el entorno virtual activo):
  python portal_bot.py --perfil local --filtro categoria=Café          # práctica con la app local (NO es el portal oficial)
  python portal_bot.py --perfil portal --buscar "texto" --acepto-terminos   # cuando el perfil "portal" esté configurado
"""
import argparse
import json
import os
import sys
import time
from urllib.parse import urlparse, urlunparse
from urllib.robotparser import RobotFileParser

from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, StaleElementReferenceException, TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

import portal_datos as datos


# ───────────────────────────── PERFILES (lo único que cambia de un sitio a otro) ─────────────────────────────
def _transformar_local(reg):
    """El menú local muestra 'Categoría · Tamaño · Agotado' en un solo texto: se separa en columnas."""
    partes = [x.strip() for x in (reg.get("meta") or "").split("·")]
    return {"nombre": reg.get("nombre"), "precio": reg.get("precio"),
            "categoria": partes[0] if partes and partes[0] else None,
            "tamano": partes[1] if len(partes) > 1 else None,
            "agotado": "Sí" if any("agotado" in x.lower() for x in partes[2:]) else "No"}


PERFILES = {
    # PERFIL DE PRÁCTICA: la propia aplicación Café & Charla. NO es el portal oficial.
    # '{S}' se sustituye por la sal vigente del DOM (la app rota el nombre de sus atributos cada hora; ver <body data-ds>).
    "local": {
        "nombre": "Café & Charla (aplicación local, solo práctica)",
        "url_inicio": "http://localhost:3000/menu",
        "es_local": True,
        "busqueda": None,       # el menú no tiene campo de búsqueda
        "paginacion": None,     # ni paginación: es una sola lista
        "filtros": {"categoria": {"tipo": "click",
                                  "xpath": "//div[@role='group'][@aria-label='Filtrar por categoría']//button[normalize-space()='{valor}']"}},
        "sin_resultados": "main div.card.text-center",
        "resultados": {"fila": "[data-{S}='menu-item']",
                       "campos": {"nombre": ("[data-{S}='menu-name']", None), "precio": ("[data-{S}='menu-price']", None),
                                  "meta": ("[data-{S}='menu-meta']", None)}},
        "transformar": _transformar_local,
        "limpieza": {"columnas": ["nombre", "precio", "categoria", "tamano", "agotado"], "obligatorias": ["nombre", "precio"],
                     "clave": ["nombre", "categoria", "tamano"], "numericas": ["precio"], "decimal": "."},
    },
    # PORTAL OFICIAL: PENDIENTE. Se completa DESPUÉS de inspeccionar el portal real (ver guía). No se inventan selectores.
    #   busqueda:   {"campo": "<css del campo>", "boton": "<css del botón o None para usar Enter>"}
    #   filtros:    {"nombre": {"tipo": "click", "xpath": "...{valor}..."} | {"tipo": "select", "css": "<css del <select>>"}}
    #   paginacion: {"siguiente": "<css del botón siguiente>"}
    #   resultados: {"fila": "<css de cada resultado>", "campos": {"columna": ("<css relativo a la fila>", None | "atributo")}}
    #   limpieza:   {"columnas": [...], "obligatorias": [...], "clave": [...], "fechas": [...], "formato_fecha": "%d/%m/%Y",
    #                "dayfirst": True, "numericas": [...], "decimal": ","}
    "portal": {
        "nombre": "Portal oficial (sin configurar)", "url_inicio": None, "es_local": False,
        "busqueda": None, "paginacion": None, "filtros": {}, "sin_resultados": None,
        "resultados": {"fila": None, "campos": {}}, "transformar": None, "limpieza": None,
    },
}


def validar_perfil(p):
    faltan = []
    if not p.get("url_inicio"): faltan.append("url_inicio")
    if not (p.get("resultados") or {}).get("fila"): faltan.append("resultados.fila")
    if not (p.get("resultados") or {}).get("campos"): faltan.append("resultados.campos")
    if not p.get("limpieza"): faltan.append("limpieza")
    return faltan


# ───────────────────────────── Ética: robots.txt, verificación humana y bloqueos ─────────────────────────────
class BloqueoDelSitio(Exception):
    """El sitio bloquea, limita o exige una verificación que no se completó. No se intenta eludir."""


TERMINOS_VERIFICACION = ("captcha", "recaptcha", "hcaptcha", "verify you are human", "verifica que eres humano", "verificación de seguridad",
                         "comprobando tu navegador", "checking your browser", "just a moment")
TERMINOS_BLOQUEO = ("access denied", "acceso denegado", "too many requests", "demasiadas solicitudes", "403 forbidden", "you have been blocked", "has sido bloqueado")


def permitido_por_robots(url):
    """Devuelve (True/False/None, mensaje). None = no se pudo consultar robots.txt."""
    u = urlparse(url)
    rp = RobotFileParser(urlunparse((u.scheme, u.netloc, "/robots.txt", "", "", "")))
    try:
        rp.read()
    except Exception as e:
        return None, f"no se pudo leer robots.txt ({e})"
    return rp.can_fetch("*", url), "robots.txt consultado"


def detectar(driver):
    """Heurística: 'bloqueo', 'verificacion' o None. Mira el texto visible y los iframes (reCAPTCHA, hCaptcha, etc.)."""
    try:
        texto = driver.find_element(By.TAG_NAME, "body").text.lower()
        iframes = " ".join((f.get_attribute("src") or "") for f in driver.find_elements(By.TAG_NAME, "iframe")).lower()
    except Exception:
        return None
    if any(t in texto for t in TERMINOS_BLOQUEO):
        return "bloqueo"
    if any(t in texto or t in iframes for t in TERMINOS_VERIFICACION):
        return "verificacion"
    return None


def revisar_bloqueo(driver, espera_humana):
    estado = detectar(driver)
    if estado is None:
        return
    if estado == "bloqueo":
        raise BloqueoDelSitio("El sitio muestra un bloqueo o un límite de acceso. No se intentará eludir.")
    print("\n  ⚠ Se detectó una verificación humana (CAPTCHA o desafío). El bot NO la resolverá.")
    print(f"    Resuélvela TÚ en la ventana del navegador. Esperando hasta {espera_humana} s…")
    fin = time.time() + espera_humana
    while time.time() < fin:
        time.sleep(2)  # sondeo cada 2 s para ver si la persona ya terminó (no es sincronización de la página)
        if detectar(driver) is None:
            print("  ✓ Verificación completada por la persona. Se continúa.")
            return
    raise BloqueoDelSitio("La verificación humana no se completó a tiempo. Ejecución detenida.")


# ───────────────────────────── Navegación con esperas explícitas ─────────────────────────────
def crear_driver(headless):
    o = Options()
    o.add_argument("--window-size=1200,900")
    if headless:
        o.add_argument("--headless=new")
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=o)
    except Exception as e:
        print(f"    (webdriver-manager no disponible: {e}) → se usa Selenium Manager")
        return webdriver.Chrome(options=o)


def _sal(driver):
    return driver.execute_script("return document.body.getAttribute('data-ds')") or ""


def _estado_resultados(d, p):
    r = _sal(d)
    if d.find_elements(By.CSS_SELECTOR, p["resultados"]["fila"].replace("{S}", r)):
        return "filas"
    if p.get("sin_resultados") and d.find_elements(By.CSS_SELECTOR, p["sin_resultados"].replace("{S}", r)):
        return "vacio"
    return False


def esperar_resultados(driver, wait, p, espera_humana):
    """Espera a que haya filas o un aviso de 'sin resultados'. Si se agota el tiempo y había una verificación, da otra oportunidad."""
    for intento in (1, 2):
        try:
            return wait.until(lambda d: _estado_resultados(d, p))
        except TimeoutException:
            if intento == 2 or detectar(driver) is None:
                raise
            revisar_bloqueo(driver, espera_humana)


def ejecutar_busqueda(driver, wait, p, texto):
    b = p["busqueda"]
    campo = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, b["campo"])))
    campo.clear()
    campo.send_keys(texto)
    if b.get("boton"):
        wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, b["boton"]))).click()
    else:
        campo.send_keys(Keys.ENTER)


def aplicar_filtro(driver, wait, p, nombre, valor):
    f = (p.get("filtros") or {}).get(nombre)
    if not f:
        raise ValueError(f"Filtro desconocido '{nombre}'. Disponibles en este perfil: {', '.join(p.get('filtros') or {}) or 'ninguno'}")
    if f["tipo"] == "click":
        if "'" in valor:
            raise ValueError("El valor del filtro no puede contener comillas simples.")
        wait.until(EC.element_to_be_clickable((By.XPATH, f["xpath"].replace("{valor}", valor)))).click()
    else:
        Select(wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, f["css"])))).select_by_visible_text(valor)


def _leer_filas(driver, p, vistos):
    r = _sal(driver)
    nuevos = []
    for fila in driver.find_elements(By.CSS_SELECTOR, p["resultados"]["fila"].replace("{S}", r)):
        reg = {}
        for col, (css, attr) in p["resultados"]["campos"].items():
            try:
                el = fila.find_element(By.CSS_SELECTOR, css.replace("{S}", r))
                reg[col] = el.get_attribute(attr) if attr else el.get_attribute("textContent")
            except NoSuchElementException:
                reg[col] = None  # campo ausente en esa fila: queda nulo (no se inventa)
        clave = json.dumps(reg, sort_keys=True, ensure_ascii=False)
        if clave in vistos:
            continue  # duplicado ya acumulado (p. ej. una fila repetida en dos páginas)
        vistos.add(clave)
        nuevos.append(p["transformar"](reg) if p.get("transformar") else reg)
    return nuevos


def leer_pagina(driver, p, vistos):
    for _ in range(3):
        try:
            return _leer_filas(driver, p, vistos)
        except StaleElementReferenceException:
            time.sleep(0.5)  # el DOM se volvió a pintar mientras se leía; se espera un instante y se relee
    raise RuntimeError("El contenido de la página cambia constantemente; no se pudo leerlo de forma estable.")


def _firma(driver, p):
    r = _sal(driver)
    filas = driver.find_elements(By.CSS_SELECTOR, p["resultados"]["fila"].replace("{S}", r))
    return filas[0].text if filas else ""


def ir_siguiente(driver, wait, p):
    """Pasa a la página siguiente. Devuelve False si no hay más páginas o si el contenido no cambió (evita bucles infinitos)."""
    botones = driver.find_elements(By.CSS_SELECTOR, p["paginacion"]["siguiente"])
    if not botones:
        return False
    b = botones[0]
    if not b.is_enabled() or b.get_attribute("aria-disabled") == "true" or "disabled" in (b.get_attribute("class") or ""):
        return False
    antes = _firma(driver, p)
    b.click()
    try:
        wait.until(lambda d: _firma(d, p) not in ("", antes))
    except TimeoutException:
        print("    La página no cambió tras pulsar 'siguiente': se asume que era la última.")
        return False
    return True


def extraer(driver, p, a, filtros):
    wait = WebDriverWait(driver, a.timeout)
    print(f"[2] Abriendo el portal: {p['url_inicio']}")
    driver.get(p["url_inicio"])
    revisar_bloqueo(driver, a.espera_humana)

    if a.buscar:
        if p.get("busqueda"):
            print(f"[3] Búsqueda: {a.buscar!r}")
            ejecutar_busqueda(driver, wait, p, a.buscar)
            revisar_bloqueo(driver, a.espera_humana)
        else:
            print("[3] ! Este perfil no tiene campo de búsqueda: se omite --buscar.")
    else:
        print("[3] Sin criterio de búsqueda (no se indicó --buscar).")

    if filtros:
        for nombre, valor in filtros:
            print(f"[4] Filtro aplicado: {nombre} = {valor}")
            aplicar_filtro(driver, wait, p, nombre, valor)
            revisar_bloqueo(driver, a.espera_humana)
    else:
        print("[4] Sin filtros (no se indicó --filtro).")

    print("[5] Recorriendo resultados")
    registros, vistos = [], set()
    for pagina in range(1, a.max_paginas + 1):
        if esperar_resultados(driver, wait, p, a.espera_humana) == "vacio":
            print(f"    Página {pagina}: el portal informa que no hay resultados.")
            break
        revisar_bloqueo(driver, a.espera_humana)
        nuevos = leer_pagina(driver, p, vistos)
        registros.extend(nuevos)
        print(f"    Página {pagina}: {len(nuevos)} registros nuevos (acumulado: {len(registros)})")
        if not p.get("paginacion"):
            print("    Este perfil no tiene paginación: se leyó una sola página.")
            break
        if pagina == a.max_paginas:
            print(f"    Se alcanzó el límite de {a.max_paginas} páginas (--max-paginas).")
            break
        time.sleep(a.pausa)  # pausa de cortesía: no pedir páginas una tras otra sin descanso
        if not ir_siguiente(driver, wait, p):
            print("    No hay más páginas.")
            break
    return registros


# ───────────────────────────── Programa principal ─────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="Extracción (Selenium) → limpieza (Pandas) → almacenamiento (SQLite).")
    ap.add_argument("--perfil", choices=list(PERFILES), default="local")
    ap.add_argument("--buscar", default=None, help="Texto a buscar (si el perfil tiene buscador)")
    ap.add_argument("--filtro", action="append", default=[], metavar="CLAVE=VALOR", help="Filtro del perfil; se puede repetir")
    ap.add_argument("--max-paginas", type=int, default=5)
    ap.add_argument("--pausa", type=float, default=1.5, help="Segundos de cortesía entre páginas")
    ap.add_argument("--timeout", type=int, default=20, help="Segundos máximos de espera por elemento")
    ap.add_argument("--espera-humana", type=int, default=180, help="Segundos que se espera a que una persona resuelva una verificación")
    ap.add_argument("--db", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "output", "portal.db"))
    ap.add_argument("--tabla", default="registros")
    ap.add_argument("--csv", action="store_true", help="Exportar también un CSV junto a la base de datos")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--mantener-abierto", action="store_true", help="No cerrar el navegador hasta pulsar Enter (para tomar capturas)")
    ap.add_argument("--acepto-terminos", action="store_true", help="Confirmo haber revisado los términos de uso del portal")
    a = ap.parse_args()
    p = PERFILES[a.perfil]

    filtros = []
    for f in a.filtro:
        k, sep, v = f.partition("=")
        if not sep or not k or not v:
            sys.exit(f"Filtro mal escrito: {f!r}. Usa CLAVE=VALOR, por ejemplo categoria=Café")
        filtros.append((k.strip(), v.strip()))

    print(f"\n[1] Inicio del bot · perfil: {p['nombre']}")
    faltan = validar_perfil(p)
    if faltan:
        print(f"\n  ✗ El perfil '{a.perfil}' está incompleto. Falta: {', '.join(faltan)}.")
        print("    Inspecciona el portal real y completa PERFILES['portal'] en portal_bot.py (no se inventan selectores).")
        sys.exit(2)
    if not p["es_local"]:
        if not a.acepto_terminos:
            sys.exit("Antes de automatizar un portal revisa sus términos de uso y robots.txt, y vuelve a ejecutar con --acepto-terminos.")
        ok, msg = permitido_por_robots(p["url_inicio"])
        print(f"    robots.txt: {msg}")
        if ok is False:
            sys.exit("robots.txt NO permite acceder automáticamente a esa URL. Se detiene la ejecución.")
        if ok is None:
            print("    ! No se pudo verificar robots.txt; confirma manualmente que la automatización está permitida.")

    try:
        driver = crear_driver(a.headless)
    except Exception as e:
        sys.exit(f"  ✗ No se pudo abrir Chrome: {e}\n    Comprueba que Google Chrome esté instalado y ejecuta primero verificar_entorno.py")

    registros, estado, motivo = [], "completa", ""
    try:
        registros = extraer(driver, p, a, filtros)
    except BloqueoDelSitio as e:
        estado, motivo = "interrumpida", str(e)
    except TimeoutException:
        estado, motivo = "interrumpida", "Tiempo de espera agotado: un elemento no apareció (¿cambió la estructura del sitio o hay un selector incorrecto?)."
    except (ValueError, RuntimeError) as e:
        estado, motivo = "interrumpida", str(e)
    finally:
        if a.mantener_abierto:
            input("\n  Navegador abierto para tomar la captura. Pulsa Enter para cerrarlo…")
        driver.quit()  # el navegador siempre se cierra
    if estado != "completa":
        print(f"\n  ⚠ Extracción {estado}: {motivo}\n    Se procesará y guardará lo obtenido hasta ese momento ({len(registros)} registros).")

    cfg = p["limpieza"]
    print(f"\n[6] Registros extraídos: {len(registros)}  →  se convierten en un DataFrame")
    print("[7] Limpieza y validación")
    limpios, descartados, r = datos.procesar(registros, cfg)
    print(f"    extraídos={r['extraidos']}  válidos={r['validos']}  descartados={r['descartados']}  duplicados={r['duplicados']}")
    print(f"    fechas inválidas={r['fechas_invalidas']}  números inválidos={r['numeros_invalidos']}")
    print(f"    nulos por columna: {r['nulos']}")
    if not descartados.empty:
        print("    Descartados (motivo):")
        print(descartados[cfg["columnas"][:2] + ["motivo_descarte"]].head(10).to_string())
    print("[8] Tabla procesada")
    datos.mostrar(limpios, cfg["columnas"])

    print("[9] Almacenamiento")
    try:
        os.makedirs(os.path.dirname(a.db), exist_ok=True)
        g = datos.guardar(limpios, a.db, a.tabla, cfg)
        rec = datos.leer(a.db, a.tabla)
        if a.csv:
            ruta_csv = os.path.splitext(a.db)[0] + ".csv"
            rec.drop(columns=["_original"]).to_csv(ruta_csv, index=False, encoding="utf-8-sig")
            print(f"    CSV exportado: {ruta_csv}")
    except datos.ErrorAlmacenamiento as e:
        sys.exit(f"  ✗ {e}")
    print(f"    Base de datos: {a.db}  (tabla '{a.tabla}')")
    print(f"    Guardados ahora: {g['nuevos']} · ya existían: {g['ya_existian']} · total en la tabla: {g['total_en_tabla']}")
    print(f"    Recuperados de la base: {len(rec)} registros")

    print(f"\n[10] RESUMEN  estado={estado} · extraídos={r['extraidos']} · válidos={r['validos']} · descartados={r['descartados']} · "
          f"nuevos guardados={g['nuevos']} · total en base={g['total_en_tabla']}\n")
    sys.exit(0 if estado == "completa" else 1)


if __name__ == "__main__":
    main()
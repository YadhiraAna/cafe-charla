#!/usr/bin/env python3
"""
Bot de extracción estructurada: Selenium (búsqueda + filtros + paginación) → Pandas (limpieza) → SQLite / CSV / JSON / Excel.

Reutiliza los módulos comunes del proyecto (navegador, bloqueos, robots, database, portal_datos): aquí solo vive
lo propio de esta etapa, los PERFILES (lo único que cambia de un sitio a otro) y la navegación del portal.

Ética: solo contenido público y autorizado, pausas entre páginas, respeta robots.txt y NO evade CAPTCHA, antibots ni
bloqueos: si aparece una verificación se detiene y espera a que una PERSONA la resuelva (o la omite en modo headless).

Uso (también disponible desde el menú de main.py, opción 3):
  python portal_bot.py --perfil local --csv --json --excel                     # app Café & Charla local (práctica)
  python portal_bot.py --perfil local --url https://mi-app.vercel.app --excel   # misma app, desplegada
  python portal_bot.py --perfil local --filtro categoria=Café                   # solo una categoría
  python portal_bot.py --perfil portal --buscar "texto" --acepto-terminos       # cuando el perfil "portal" esté configurado
"""
import argparse
import json
import sys
import time
from urllib.parse import urlparse, urlunparse

import pandas as pd
from selenium.common.exceptions import NoSuchElementException, StaleElementReferenceException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

import config
import portal_datos as datos
import robots
from bloqueos import BloqueoDelSitio, analizar_bloqueo, gestionar_bloqueo
from database import conectar_bd
from navegador import GestorNavegador
from utilidades import normalizar_url


# ───────────────────────────── PERFILES (lo único que cambia de un sitio a otro) ─────────────────────────────
def _transformar_local(reg):
    """El menú local muestra 'Categoría · Tamaño · Agotado' en un solo texto: se separa en columnas."""
    partes = [x.strip() for x in (reg.get("meta") or "").split("·")]
    return {"nombre": reg.get("nombre"), "precio": reg.get("precio"),
            "categoria": partes[0] if partes and partes[0] else None,
            "tamano": partes[1] if len(partes) > 1 else None,
            "agotado": "Sí" if any("agotado" in x.lower() for x in partes[2:]) else "No"}


PERFILES = {
    # PERFIL DE PRÁCTICA: la propia aplicación Café & Charla (local o desplegada con --url). NO es el portal oficial.
    # '{S}' se sustituye por la sal vigente del DOM (la app rota el nombre de sus atributos cada hora; ver <body data-ds>).
    "local": {
        "nombre": "Café & Charla (aplicación propia, solo práctica)",
        "url_inicio": config.URL_PORTAL_PRUEBA,
        "es_local": True,       # app propia: no exige --acepto-terminos ni consulta robots.txt
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
    # PORTAL OFICIAL: PENDIENTE. Se completa DESPUÉS de inspeccionar el portal real (F12). No se inventan selectores.
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


def _aplicar_url(p, url):
    """Devuelve una copia del perfil con otra URL. Si solo se da el dominio, conserva la ruta del perfil (p. ej. /menu)."""
    destino = normalizar_url(url)
    if not destino:
        raise ValueError(f"URL no válida: {url!r}")
    u = urlparse(destino)
    if u.path in ("", "/") and p.get("url_inicio"):
        u = u._replace(path=urlparse(p["url_inicio"]).path)
    return {**p, "url_inicio": urlunparse(u)}


# ───────────────────────────── Navegación con esperas explícitas ─────────────────────────────
def _sal(driver):
    return driver.execute_script("return document.body.getAttribute('data-ds')") or ""


def _estado_resultados(d, p):
    r = _sal(d)
    if d.find_elements(By.CSS_SELECTOR, p["resultados"]["fila"].replace("{S}", r)):
        return "filas"
    if p.get("sin_resultados") and d.find_elements(By.CSS_SELECTOR, p["sin_resultados"].replace("{S}", r)):
        return "vacio"
    return False


def _revisar(driver, conn, url, automatico):
    """Revisa captcha/bloqueo con el módulo común; si no se resolvió, aborta la extracción (sin eludirlo)."""
    estado = gestionar_bloqueo(driver, conn, url, automatico=automatico)
    if estado in ("omitida", "cancelada"):
        raise BloqueoDelSitio(f"Verificación/bloqueo en {url} ({estado}). No se intentará eludir.")


def esperar_resultados(driver, wait, p, conn, automatico):
    """Espera a que haya filas o un aviso de 'sin resultados'. Si se agota el tiempo y había una verificación, da otra oportunidad."""
    for intento in (1, 2):
        try:
            return wait.until(lambda d: _estado_resultados(d, p))
        except TimeoutException:
            if intento == 2 or not analizar_bloqueo(driver):
                raise
            _revisar(driver, conn, driver.current_url, automatico)


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


def extraer(driver, conn, p, a, filtros, automatico):
    wait = WebDriverWait(driver, a.timeout)
    print(f"[2] Abriendo el portal: {p['url_inicio']}")
    driver.get(p["url_inicio"])
    if "vercel.com/login" in (driver.current_url or ""):
        raise RuntimeError("La URL redirige al login de Vercel (Deployment Protection). Desactívala en Vercel → Settings → "
                           "Deployment Protection, usa el dominio de producción o corre la app en local. El bot no inicia sesión.")
    _revisar(driver, conn, p["url_inicio"], automatico)

    if a.buscar:
        if p.get("busqueda"):
            print(f"[3] Búsqueda: {a.buscar!r}")
            ejecutar_busqueda(driver, wait, p, a.buscar)
            _revisar(driver, conn, driver.current_url, automatico)
        else:
            print("[3] ! Este perfil no tiene campo de búsqueda: se omite --buscar.")
    else:
        print("[3] Sin criterio de búsqueda (no se indicó --buscar).")

    if filtros:
        for nombre, valor in filtros:
            print(f"[4] Filtro aplicado: {nombre} = {valor}")
            aplicar_filtro(driver, wait, p, nombre, valor)
            _revisar(driver, conn, driver.current_url, automatico)
    else:
        print("[4] Sin filtros (no se indicó --filtro).")

    print("[5] Recorriendo resultados")
    registros, vistos = [], set()
    for pagina in range(1, a.max_paginas + 1):
        if esperar_resultados(driver, wait, p, conn, automatico) == "vacio":
            print(f"    Página {pagina}: el portal informa que no hay resultados.")
            break
        _revisar(driver, conn, driver.current_url, automatico)
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


# ───────────────────────────── Flujo completo (lo usan la línea de comandos y el menú) ─────────────────────────────
def parsear_filtros(textos):
    filtros = []
    for f in textos:
        k, sep, v = f.partition("=")
        if not sep or not k.strip() or not v.strip():
            raise ValueError(f"Filtro mal escrito: {f!r}. Usa CLAVE=VALOR, por ejemplo categoria=Café")
        filtros.append((k.strip(), v.strip()))
    return filtros


def correr(a, navegador=None):
    """Ejecuta extracción → limpieza → almacenamiento. Devuelve 0 (completa), 1 (interrumpida pero guardada) o 2 (no se ejecutó)."""
    p = PERFILES[a.perfil]
    try:
        filtros = parsear_filtros(a.filtro)
        if a.url:
            p = _aplicar_url(p, a.url)
    except ValueError as e:
        print(f"  ✗ {e}")
        return 2

    print(f"\n[1] Inicio del bot · perfil: {p['nombre']}")
    faltan = validar_perfil(p)
    if faltan:
        print(f"\n  ✗ El perfil '{a.perfil}' está incompleto. Falta: {', '.join(faltan)}.")
        print("    Inspecciona el portal real y completa PERFILES['portal'] en portal_bot.py (no se inventan selectores).")
        return 2
    if not p["es_local"]:
        if not a.acepto_terminos:
            print("  ✗ Antes de automatizar un portal revisa sus términos de uso y robots.txt, y vuelve a ejecutar con --acepto-terminos.")
            return 2
        ok, msg = robots.permitido(p["url_inicio"])
        print(f"    robots.txt: {msg}")
        if ok is False:
            print("  ✗ robots.txt NO permite acceder automáticamente a esa URL. Se detiene la ejecución.")
            return 2
        if ok is None:
            print("    ! No se pudo verificar robots.txt; confirma manualmente que la automatización está permitida.")

    propio = navegador is None
    navegador = navegador or GestorNavegador(headless=a.headless)
    automatico = True if a.headless else None   # en headless nadie puede resolver un captcha: se omite y se registra
    conn = conectar_bd(a.db)
    registros, estado, motivo = [], "completa", ""
    try:
        try:
            driver = navegador.obtener()
        except Exception as e:
            print(f"  ✗ No se pudo abrir Chrome: {e}\n    Comprueba que Google Chrome esté instalado.")
            return 2
        try:
            registros = extraer(driver, conn, p, a, filtros, automatico)
        except BloqueoDelSitio as e:
            estado, motivo = "interrumpida", str(e)
        except TimeoutException:
            estado, motivo = "interrumpida", "Tiempo de espera agotado: un elemento no apareció (¿cambió la estructura del sitio o hay un selector incorrecto?)."
        except (ValueError, RuntimeError) as e:
            estado, motivo = "interrumpida", str(e)
        finally:
            if a.mantener_abierto:
                input("\n  Navegador abierto para tomar la captura. Pulsa Enter para continuar…")
    finally:
        conn.close()
        if propio:
            navegador.cerrar()  # el navegador siempre se cierra (si lo abrió este bot)
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
        g = datos.guardar(limpios, a.db, a.tabla, cfg)
        rec = datos.leer(a.db, a.tabla)
        for ruta in datos.exportar_dataset(rec, descartados, r, a.tabla, config.DIR_SALIDA, a.csv, a.json, a.excel):
            print(f"    Exportado: {ruta}")
    except datos.ErrorAlmacenamiento as e:
        print(f"  ✗ {e}")
        return 2
    print(f"    Base de datos: {a.db}  (tabla '{a.tabla}')")
    print(f"    Guardados ahora: {g['nuevos']} · ya existían: {g['ya_existian']} · total en la tabla: {g['total_en_tabla']}")
    print(f"    Recuperados de la base: {len(rec)} registros")
    print(f"\n[10] RESUMEN  estado={estado} · extraídos={r['extraidos']} · válidos={r['validos']} · descartados={r['descartados']} · "
          f"nuevos guardados={g['nuevos']} · total en base={g['total_en_tabla']}\n")
    return 0 if estado == "completa" else 1


def crear_parser():
    ap = argparse.ArgumentParser(description="Extracción (Selenium) → limpieza (Pandas) → almacenamiento (SQLite/CSV/JSON/Excel).")
    ap.add_argument("--perfil", choices=list(PERFILES), default="local")
    ap.add_argument("--url", default=None, help="Sustituye la URL del perfil (p. ej. https://mi-app.vercel.app; si no lleva ruta se usa la del perfil)")
    ap.add_argument("--buscar", default=None, help="Texto a buscar (si el perfil tiene buscador)")
    ap.add_argument("--filtro", action="append", default=[], metavar="CLAVE=VALOR", help="Filtro del perfil; se puede repetir")
    ap.add_argument("--max-paginas", type=int, default=config.MAX_PAGINAS_PORTAL)
    ap.add_argument("--pausa", type=float, default=config.PAUSA_PAGINACION, help="Segundos de cortesía entre páginas")
    ap.add_argument("--timeout", type=int, default=config.TIEMPO_ESPERA, help="Segundos máximos de espera por elemento")
    ap.add_argument("--db", default=config.DB_NAME)
    ap.add_argument("--tabla", default=config.TABLA_DATASET)
    ap.add_argument("--csv", action="store_true", help="Exportar también CSV a la carpeta output/")
    ap.add_argument("--json", action="store_true", help="Exportar también JSON a la carpeta output/")
    ap.add_argument("--excel", action="store_true", help="Exportar también Excel (.xlsx) con las hojas datos, descartados y resumen")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--mantener-abierto", action="store_true", help="No continuar hasta pulsar Enter (para tomar capturas)")
    ap.add_argument("--acepto-terminos", action="store_true", help="Confirmo haber revisado los términos de uso del portal")
    return ap


if __name__ == "__main__":
    sys.exit(correr(crear_parser().parse_args()))

# -*- coding: utf-8 -*-
"""Procesamiento de páginas y rastreo de todos los módulos de un sitio."""

import sqlite3
import time
from collections import deque
from urllib.parse import urlparse

from selenium.common.exceptions import TimeoutException, WebDriverException

from bloqueos import gestionar_bloqueo
from config import EXTENSIONES_IGNORADAS, PAUSA_ENTRE_PAGINAS
from database import guardar_datos
from extractor import extraer_datos
from utilidades import desplazar_pagina, esperar_carga, limpiar_enlace


def procesar_pagina(conn, driver, url):
    """
    Visita una URL, revisa si hay captcha, extrae y guarda.
    Devuelve (estado, datos). 'datos' es None si no se extrajo nada.
    """
    driver.get(url)
    esperar_carga(driver)
    time.sleep(1)  # pausa para que cargue el widget del captcha (suele ser asíncrono)

    estado = gestionar_bloqueo(driver, conn, url)
    if estado in ("omitida", "cancelada"):
        return estado, None

    desplazar_pagina(driver)
    datos = extraer_datos(driver)
    guardar_datos(conn, url, datos)
    return estado, datos


def rastrear_sitio(conn, navegador, url_inicial, max_paginas):
    """
    Recorre todos los módulos del sitio: parte de la URL inicial y sigue los
    enlaces internos (mismo dominio) en anchura, sin repetir páginas.
    """
    url_inicial = limpiar_enlace(url_inicial)
    dominio = urlparse(url_inicial).netloc.lower()
    pendientes = deque([url_inicial])
    visitadas = set()
    resumen = {"limpias": 0, "con_captcha": [], "errores": []}

    driver = navegador.obtener()

    while pendientes and len(visitadas) < max_paginas:
        url = pendientes.popleft()
        if url in visitadas:
            continue
        visitadas.add(url)

        print(f"\n[{len(visitadas)}/{max_paginas}] Visitando: {url}")
        try:
            estado, datos = procesar_pagina(conn, driver, url)
        except TimeoutException:
            print("    [ERROR] Tiempo de espera agotado.")
            resumen["errores"].append(url)
            continue
        except WebDriverException as e:
            print(f"    [ERROR] Navegador/conexión: {(e.msg or str(e)).splitlines()[0]}")
            resumen["errores"].append(url)
            continue
        except sqlite3.Error as e:
            print(f"    [ERROR] Base de datos: {e}")
            resumen["errores"].append(url)
            continue

        if estado == "cancelada":
            resumen["con_captcha"].append((url, estado))
            print("[!] Rastreo cancelado por el usuario.")
            break
        if estado != "limpia":
            resumen["con_captcha"].append((url, estado))
        if datos is None:
            continue  # página bloqueada: no hay enlaces que seguir

        resumen["limpias"] += 1
        print(f"    [OK] {len(datos['enlaces'])} enlaces, {len(datos['imagenes'])} imágenes, "
              f"{len(datos['parrafos'])} párrafos")

        # Encolar enlaces internos nuevos
        for href, _texto in datos["enlaces"]:
            href = limpiar_enlace(href)
            if (urlparse(href).netloc.lower() == dominio
                    and not href.lower().endswith(EXTENSIONES_IGNORADAS)
                    and href not in visitadas
                    and href not in pendientes):
                pendientes.append(href)

        time.sleep(PAUSA_ENTRE_PAGINAS)  # pausa entre páginas

    _imprimir_reporte(resumen, visitadas, pendientes, max_paginas)


def _imprimir_reporte(resumen, visitadas, pendientes, max_paginas):
    """Muestra el resumen final del rastreo y si se encontraron captchas."""
    print("\n" + "=" * 60)
    print("REPORTE DEL RASTREO")
    print("=" * 60)
    print(f"Páginas visitadas       : {len(visitadas)}")
    print(f"Extraídas correctamente : {resumen['limpias']}")
    print(f"Con captcha/bloqueo     : {len(resumen['con_captcha'])}")
    for url, estado in resumen["con_captcha"]:
        print(f"    - {url}  [{estado}]")
    print(f"Con errores             : {len(resumen['errores'])}")
    for url in resumen["errores"]:
        print(f"    - {url}")
    if resumen["con_captcha"]:
        print("\n>>> El bot SE ENCONTRÓ con un captcha/bloqueo en este sitio.")
    else:
        print("\n>>> No se detectó ningún captcha/bloqueo.")
    if pendientes:
        print(f"(Quedaron {len(pendientes)} páginas sin visitar por el límite de {max_paginas})")
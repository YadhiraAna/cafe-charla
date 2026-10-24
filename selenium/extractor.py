# -*- coding: utf-8 -*-
"""Extracción y limpieza de elementos HTML de la página cargada."""

from selenium.common.exceptions import StaleElementReferenceException
from selenium.webdriver.common.by import By

from config import MIN_LEN_PARRAFO
from utilidades import limpiar_texto


def extraer_datos(driver):
    """Extrae y limpia título, encabezados, enlaces, imágenes y párrafos."""
    datos = {"titulo": "", "encabezados": [], "enlaces": [], "imagenes": [], "parrafos": []}

    # --- Título (<title>) ---
    datos["titulo"] = limpiar_texto(driver.title)

    # --- Encabezados h1, h2, h3 (XPath con unión: conserva el orden del documento) ---
    vistos = set()
    for el in driver.find_elements(By.XPATH, "//h1 | //h2 | //h3"):
        try:
            nivel = el.tag_name.lower()
            texto = limpiar_texto(el.get_attribute("textContent"))
            if texto and (nivel, texto) not in vistos:
                vistos.add((nivel, texto))
                datos["encabezados"].append((nivel, texto))
        except StaleElementReferenceException:
            continue  # el elemento cambió en el DOM; lo omitimos

    # --- Enlaces <a href> (solo http/https, sin duplicados) ---
    vistos = set()
    for el in driver.find_elements(By.CSS_SELECTOR, "a[href]"):
        try:
            href = (el.get_attribute("href") or "").strip()  # Selenium ya devuelve URL absoluta
            if not href.lower().startswith(("http://", "https://")) or href in vistos:
                continue
            texto = limpiar_texto(
                el.get_attribute("textContent")
                or el.get_attribute("aria-label")
                or el.get_attribute("title")
            )
            vistos.add(href)
            datos["enlaces"].append((href, texto))
        except StaleElementReferenceException:
            continue

    # --- Imágenes <img> (src + alt; soporta lazy-load con data-src) ---
    vistos = set()
    for el in driver.find_elements(By.CSS_SELECTOR, "img"):
        try:
            src = (
                el.get_attribute("src")
                or el.get_attribute("data-src")
                or el.get_attribute("data-lazy-src")
                or ""
            ).strip()
            if not src or src.startswith("data:") or src in vistos:
                continue  # descartamos vacías, base64 incrustadas y duplicadas
            vistos.add(src)
            datos["imagenes"].append((src, limpiar_texto(el.get_attribute("alt"))))
        except StaleElementReferenceException:
            continue

    # --- Párrafos <p> significativos (largo mínimo, sin duplicados) ---
    vistos = set()
    for el in driver.find_elements(By.CSS_SELECTOR, "p"):
        try:
            texto = limpiar_texto(el.get_attribute("textContent"))
            if len(texto) >= MIN_LEN_PARRAFO and texto not in vistos:
                vistos.add(texto)
                datos["parrafos"].append(texto)
        except StaleElementReferenceException:
            continue

    return datos
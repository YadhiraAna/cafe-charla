# -*- coding: utf-8 -*-
"""Funciones auxiliares: limpieza de texto, manejo de URLs y esperas explícitas."""

import re
import time
from urllib.parse import urldefrag, urlparse

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from config import TIEMPO_ESPERA


def limpiar_texto(texto):
    """Normaliza espacios, saltos de línea y tabulaciones."""
    if not texto:
        return ""
    return re.sub(r"\s+", " ", texto).strip()


def normalizar_url(entrada):
    """
    Valida la URL escrita por el usuario. Agrega el esquema si falta:
    http:// para localhost / 127.0.0.1 y https:// para el resto.
    Devuelve None si la URL no es válida.
    """
    entrada = entrada.strip()
    if not entrada:
        return None
    if not re.match(r"^https?://", entrada, re.IGNORECASE):
        local = re.match(r"^(localhost|127\.0\.0\.1|0\.0\.0\.0)", entrada, re.IGNORECASE)
        entrada = ("http://" if local else "https://") + entrada
    try:
        host = urlparse(entrada).hostname
    except ValueError:
        return None
    if not host:
        return None
    if "." not in host and host != "localhost":
        return None
    return entrada


def limpiar_enlace(href):
    """
    Normaliza una URL para no visitar la misma página dos veces:
    quita el #ancla y la '/' final (http://a.com/ y http://a.com son lo mismo).
    """
    href, _ = urldefrag(href.strip())
    partes = urlparse(href)
    return partes._replace(path=partes.path.rstrip("/")).geturl()


def esperar_carga(driver):
    """Espera explícita: <body> presente y document.readyState == 'complete'."""
    espera = WebDriverWait(driver, TIEMPO_ESPERA)
    espera.until(EC.presence_of_element_located((By.CSS_SELECTOR, "body")))
    espera.until(lambda d: d.execute_script("return document.readyState") == "complete")


def desplazar_pagina(driver):
    """Hace scroll gradual para disparar la carga diferida (lazy-load) de contenido."""
    try:
        for _ in range(3):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1)  # pausa estratégica para que cargue el contenido
        driver.execute_script("window.scrollTo(0, 0);")
    except WebDriverException:
        pass  # el scroll es opcional; si falla, seguimos
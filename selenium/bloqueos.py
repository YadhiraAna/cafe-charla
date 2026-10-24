# -*- coding: utf-8 -*-
"""Detección y gestión de captchas / bloqueos anti-bot (única implementación para todo el proyecto)."""

from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.common.by import By

from config import MODO_AUTOMATICO, PALABRAS_BLOQUEO, SELECTORES_CAPTCHA
from database import registrar_bloqueo
from utilidades import esperar_carga, limpiar_enlace


class BloqueoDelSitio(Exception):
    """El sitio bloquea, limita o exige una verificación que no se completó. No se intenta eludir."""


def analizar_bloqueo(driver):
    """
    Devuelve una lista con los motivos por los que la página parece un captcha/bloqueo.
    Lista vacía = página limpia.
    """
    motivos = []
    try:
        # 1) Buscar el widget del captcha en el DOM
        for selector in SELECTORES_CAPTCHA:
            if driver.find_elements(By.CSS_SELECTOR, selector):
                motivos.append(f"elemento: {selector}")

        # 2) Buscar frases típicas en el título y el texto de la página
        titulo = (driver.title or "").lower()
        cuerpo = driver.find_element(By.CSS_SELECTOR, "body").get_attribute("textContent") or ""
        muestra = (titulo + " " + cuerpo[:5000]).lower()
        for palabra in PALABRAS_BLOQUEO:
            if palabra in muestra:
                motivos.append(f"texto: '{palabra}'")
    except WebDriverException:
        pass
    return motivos


def gestionar_bloqueo(driver, conn, url, automatico=None):
    """
    Comprueba si la página tiene captcha. Devuelve el estado:
      'limpia'    -> sin captcha, se puede extraer
      'resuelta'  -> había captcha y el usuario lo resolvió a mano
      'forzada'   -> el usuario eligió continuar (posible falso positivo)
      'omitida'   -> modo automático: se registra y se salta la página
      'cancelada' -> el usuario canceló
    'automatico' (True/False) sustituye a config.MODO_AUTOMATICO (p. ej. en modo headless nadie puede resolver nada).
    """
    motivos = analizar_bloqueo(driver)
    if not motivos:
        return "limpia"

    # Si el sitio nos redirigió a otra URL (p. ej. /captcha), lo anotamos también
    actual = driver.current_url
    if limpiar_enlace(actual) != limpiar_enlace(url):
        motivos.append(f"redirigido a: {actual}")

    print("\n" + "!" * 70)
    print(f"[!] CAPTCHA / BLOQUEO DETECTADO en: {url}")
    for m in motivos:
        print(f"    - {m}")
    print("!" * 70)

    # Modo bot puro: solo informa y registra (el bot NUNCA intenta resolver ni evadir el captcha)
    if MODO_AUTOMATICO if automatico is None else automatico:
        registrar_bloqueo(conn, url, motivos, "omitida")
        return "omitida"

    # Modo con intervención humana
    print("Resuélvelo MANUALMENTE en la ventana del navegador.")
    print("  - ENTER       -> ya lo resolví, volver a comprobar")
    print("  - 'continuar' -> extraer de todos modos (falso positivo)")
    print("  - 'cancelar'  -> abortar")
    while True:
        respuesta = input("Tu respuesta: ").strip().lower()
        if respuesta == "cancelar":
            registrar_bloqueo(conn, url, motivos, "cancelada")
            return "cancelada"
        if respuesta == "continuar":
            registrar_bloqueo(conn, url, motivos, "forzada")
            return "forzada"
        try:
            esperar_carga(driver)
        except TimeoutException:
            pass
        if not analizar_bloqueo(driver):
            registrar_bloqueo(conn, url, motivos, "resuelta_manual")
            return "resuelta"
        print("[!] Aún se detecta el captcha. Inténtalo de nuevo.")

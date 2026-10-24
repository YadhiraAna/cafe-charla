#!/usr/bin/env python3
"""
Demostración académica: Selenium intenta enviar el formulario de LOGIN de la aplicación PROPIA (solo localhost).
NO resuelve ni evade el CAPTCHA (envía una respuesta arbitraria) ni oculta que es una automatización.
Objetivo: comprobar que el servidor DETECTA (HTTP 403) y LIMITA (HTTP 429) la interacción automatizada.
"""
import argparse, json, sys, time
from urllib.parse import urlparse

from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, StaleElementReferenceException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


def make_driver():
    o = Options()
    o.add_argument("--window-size=1200,900")
    o.set_capability("goog:loggingPrefs", {"performance": "ALL"})  # permite leer los códigos HTTP reales
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=o)
    except Exception as e:
        print(f"    (webdriver-manager no disponible: {e}) → usando Selenium Manager")
        return webdriver.Chrome(options=o)


def login_responses(driver):
    """Lee del registro de red del navegador las respuestas de /api/auth/login: (status, Retry-After)."""
    found = []
    for entry in driver.get_log("performance"):
        msg = json.loads(entry["message"])["message"]
        if msg.get("method") == "Network.responseReceived":
            r = msg["params"]["response"]
            if r["url"].endswith("/api/auth/login"):
                headers = {k.lower(): v for k, v in r.get("headers", {}).items()}
                found.append((r["status"], headers.get("retry-after")))
    return found


def fill(driver, by, value, text):
    el = driver.find_element(by, value)
    el.clear()
    el.send_keys(text)


def captcha_input(driver):
    """El CAPTCHA tiene IDs dinámicos; se localiza con el atributo marcado con la sal vigente del DOM."""
    sal = driver.execute_script("return document.body.getAttribute('data-ds')") or ""
    return f"[data-{sal}='captcha-input']"


def attempt(driver, n):
    wait = WebDriverWait(driver, 15, ignored_exceptions=(NoSuchElementException, StaleElementReferenceException))
    # Espera a que el reto CAPTCHA esté cargado y vacío (se recarga tras cada intento).
    wait.until(lambda d: d.find_element(By.CSS_SELECTOR, captcha_input(d)).get_attribute("value") == "")
    driver.get_log("performance")  # descarta registros anteriores
    fill(driver, By.ID, "email", "bot@example.com")
    fill(driver, By.ID, "password", "Password123")
    fill(driver, By.CSS_SELECTOR, captcha_input(driver), "0")  # respuesta arbitraria: el CAPTCHA NO se resuelve
    driver.find_element(By.CSS_SELECTOR, "form button.btn-primary").click()
    resp, deadline = [], time.time() + 15
    while not resp and time.time() < deadline:
        time.sleep(0.3)
        resp = login_responses(driver)
    time.sleep(0.6)  # deja que la interfaz pinte el mensaje de error
    alerts = [a.text for a in driver.find_elements(By.CSS_SELECTOR, "form [role=alert]") if a.text.strip()]
    status, retry = resp[-1] if resp else ("sin respuesta", None)
    extra = f"  Retry-After: {retry}s" if retry else ""
    print(f"    Intento {n}: HTTP {status}{extra}  →  «{alerts[0] if alerts else '(sin mensaje)'}»")
    return status


def main():
    ap = argparse.ArgumentParser(description="Demostración: Selenium contra las defensas de la aplicación propia (solo localhost).")
    ap.add_argument("--base-url", default="http://localhost:3000")
    ap.add_argument("--attempts", type=int, default=7)
    a = ap.parse_args()
    if urlparse(a.base_url).hostname not in ("localhost", "127.0.0.1"):
        sys.exit("Por seguridad, esta demostración solo se ejecuta contra localhost.")

    driver = make_driver()
    try:
        print(f"\n[1] Selenium abre {a.base_url}/login")
        driver.get(a.base_url + "/login")
        print("    navigator.webdriver =", driver.execute_script("return navigator.webdriver"))
        print(f"\n[2] Intenta enviar el formulario {a.attempts} veces (datos de prueba, CAPTCHA con respuesta arbitraria)")
        results = [attempt(driver, i) for i in range(1, a.attempts + 1)]
        print("\n[3] Resumen")
        print(f"    HTTP 403 (detección de automatización): {results.count(403)}")
        print(f"    HTTP 429 (rate limiting):              {results.count(429)}")
        print("    Evidencia: consola del servidor (líneas [antibot]), /admin/seguridad y /admin/logs (módulo security).")
        input("\nPresiona Enter para cerrar el navegador…")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
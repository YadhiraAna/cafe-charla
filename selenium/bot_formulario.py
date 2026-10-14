#!/usr/bin/env python3
"""Bot de Selenium contra el formulario de REGISTRO del sitio PROPIO (solo localhost)."""
import json, sys, time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE = "http://localhost:3000"
if "localhost" not in BASE and "127.0.0.1" not in BASE:
    sys.exit("Solo se permite localhost")

o = Options()
o.set_capability("goog:loggingPrefs", {"performance": "ALL"})   # para leer el HTTP real de la API
d = webdriver.Chrome(options=o)
try:
    d.get(BASE + "/registro")
    WebDriverWait(d, 20).until(lambda x: x.find_elements(By.CSS_SELECTOR, "form"))
    print("navigator.webdriver =", d.execute_script("return navigator.webdriver"))

    t0 = time.time()
    d.find_element(By.ID, "name").send_keys("Bot Prueba")
    d.find_element(By.ID, "email").send_keys("bot@example.com")
    d.find_element(By.ID, "password").send_keys("Password123")
    # El bot NO resuelve el CAPTCHA: se deja una respuesta falsa a propósito
    inputs = d.find_elements(By.CSS_SELECTOR, "form input[aria-labelledby]")
    if inputs: inputs[0].send_keys("0")
    d.find_element(By.CSS_SELECTOR, "form button.btn-primary").click()
    print(f"Formulario enviado {time.time()-t0:.2f}s después de abrirse (un humano tarda más)")

    WebDriverWait(d, 10).until(lambda x: x.find_elements(By.CSS_SELECTOR, "[role=alert]"))
    print("Mensaje del servidor:", d.find_element(By.CSS_SELECTOR, "[role=alert]").text)

    for e in d.get_log("performance"):
        m = json.loads(e["message"])["message"]
        if m["method"] == "Network.responseReceived" and "/api/auth/register" in m["params"]["response"]["url"]:
            print("HTTP", m["params"]["response"]["status"], "←", m["params"]["response"]["url"])
finally:
    d.quit()
#!/usr/bin/env python3
"""
Pruebas de las defensas anti-bot. SOLO contra tu propio sitio local (se rechaza cualquier otro host).
No resuelve ni evade CAPTCHA: su objetivo es comprobar que el sitio DETECTA y LIMITA este tráfico.

  python pruebas_antibot.py ratelimit    # ráfaga secuencial → espera HTTP 429 con Retry-After (por sesión y por IP)
  python pruebas_antibot.py parallel     # 8 "pestañas" con sesiones distintas + una persona legítima → impacto real
  python pruebas_antibot.py bot-form     # Selenium rellena el login al instante → espera bloqueo por telemetría/fingerprint
Después revisa /admin/seguridad y /admin/logs.
"""
import argparse, http.cookiejar, json, sys, threading, time, urllib.error, urllib.request
from collections import Counter
from urllib.parse import urlparse

def get(base, opener, kind="math"):
    req = urllib.request.Request(f"{base}/api/captcha?kind={kind}", headers={"User-Agent": "Mozilla/5.0 (pruebas-antibot)", "Accept-Language": "es-MX"})
    try:
        with opener.open(req, timeout=10) as r: return r.status, None
    except urllib.error.HTTPError as e: return e.code, e.headers.get("Retry-After")
    except Exception as e: return f"ERR {e}", None

def new_opener(cookies=True):
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())) if cookies else urllib.request.build_opener()

def ratelimit(base):
    for label, cookies, n in (("MISMA sesión (con cookie)", True, 40), ("SIN cookie (cada petición = sesión nueva; limita la IP)", False, 100)):
        op, codes, first = new_opener(cookies), Counter(), None
        for i in range(n):
            code, retry = get(base, op); codes[code] += 1
            if code == 429 and first is None: first = (i + 1, retry)
        print(f"\n[{label}] {n} peticiones → {dict(codes)}")
        print(f"  primer 429 en la petición #{first[0]} con Retry-After={first[1]}s" if first else "  ningún 429 (sube el número de peticiones o revisa el servidor)")

def parallel(base):
    results, legit, lock = Counter(), [], threading.Lock()
    def tab():
        op = new_opener(True)
        for _ in range(15):
            code, _ = get(base, op)
            with lock: results[code] += 1
    threads = [threading.Thread(target=tab) for _ in range(8)]
    [t.start() for t in threads]
    op = new_opener(True)
    for _ in range(4):           # persona legítima: 1 petición cada 2 s mientras ocurre la ráfaga
        time.sleep(0.3); legit.append(get(base, op)[0])
    [t.join() for t in threads]
    print(f"8 pestañas × 15 peticiones con sesiones distintas → {dict(results)}")
    print(f"Persona legítima durante la ráfaga (misma IP) → {legit}")
    print("Lectura: las sesiones distintas NO evaden el límite porque la cubeta por IP es compartida; si la persona legítima ve 429,")
    print("es el costo de limitar por IP en redes compartidas (ver docs/ANALISIS_ANTIBOT.md, sección 2).")

def bot_form(base, headed):
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    o = Options()
    if not headed: o.add_argument("--headless=new")
    d = webdriver.Chrome(options=o)
    try:
        d.get(base + "/login")
        WebDriverWait(d, 20).until(lambda x: x.find_elements(By.CSS_SELECTOR, "#captcha-prompt"))
        d.find_element(By.ID, "email").send_keys("bot@example.com")
        d.find_element(By.ID, "password").send_keys("Password123")
        d.find_element(By.CSS_SELECTOR, "[aria-labelledby=captcha-prompt]").send_keys("0")  # respuesta falsa a propósito
        d.find_element(By.CSS_SELECTOR, "form button.btn-primary").click()
        WebDriverWait(d, 10).until(lambda x: x.find_elements(By.CSS_SELECTOR, "[role=alert]"))
        print("navigator.webdriver =", d.execute_script("return navigator.webdriver"))
        print("Mensaje del sitio:", d.find_element(By.CSS_SELECTOR, "[role=alert]").text)
    finally:
        d.quit()

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("mode", choices=["ratelimit", "parallel", "bot-form"])
    ap.add_argument("--base-url", default="http://localhost:3000"); ap.add_argument("--headed", action="store_true")
    a = ap.parse_args(); host = urlparse(a.base_url).hostname
    if host not in ("localhost", "127.0.0.1"): sys.exit("Por seguridad, estas pruebas solo se ejecutan contra localhost.")
    {"ratelimit": lambda: ratelimit(a.base_url), "parallel": lambda: parallel(a.base_url), "bot-form": lambda: bot_form(a.base_url, a.headed)}[a.mode]()

if __name__ == "__main__":
    main()

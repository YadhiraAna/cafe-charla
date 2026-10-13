#!/usr/bin/env python3
"""Auditoría PASIVA: 1 GET por sitio + robots.txt. No resuelve CAPTCHA ni envía formularios."""
import re, sys, urllib.request, urllib.error
from urllib.parse import urlparse

WAF_HEADERS = {
    "cf-ray": "Cloudflare", "cf-cache-status": "Cloudflare", "cf-mitigated": "Cloudflare (reto activo)",
    "x-sucuri-id": "Sucuri", "x-iinfo": "Imperva/Incapsula", "x-amzn-waf-action": "AWS WAF",
    "x-akamai-transformed": "Akamai", "x-datadome": "DataDome", "x-px": "PerimeterX/HUMAN",
}
WAF_COOKIES = {
    "__cf_bm": "Cloudflare Bot Management", "cf_clearance": "Cloudflare (reto resuelto)",
    "_abck": "Akamai Bot Manager", "incap_ses": "Imperva", "datadome": "DataDome", "_px": "PerimeterX/HUMAN",
}
CAPTCHA_PATTERNS = {
    "reCAPTCHA": r"google\.com/recaptcha|grecaptcha", "hCaptcha": r"hcaptcha\.com",
    "Cloudflare Turnstile": r"challenges\.cloudflare\.com/turnstile", "Arkose/FunCaptcha": r"arkoselabs|funcaptcha",
}

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (auditoria-academica)", "Accept-Language": "es-MX"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.headers, r.read(400_000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read(100_000).decode("utf-8", "ignore")
    except Exception as e:
        return None, {}, f"ERR {e}"

def auditar(url):
    print(f"\n=== {url} ===")
    status, h, body = fetch(url)
    print("HTTP:", status, "| server:", h.get("server", "(oculto)"))
    if status in (403, 429, 503):
        print("  ! Respuesta de bloqueo/reto → posible WAF o protección anti-bot activa")
    for k, v in WAF_HEADERS.items():
        if k in {x.lower() for x in h.keys()}: print(f"  [WAF] cabecera {k} → {v}")
    cookies = " ".join(h.get_all("set-cookie") or [])
    for k, v in WAF_COOKIES.items():
        if k in cookies: print(f"  [WAF] cookie {k} → {v}")
    for nombre, pat in CAPTCHA_PATTERNS.items():
        if re.search(pat, body, re.I): print(f"  [CAPTCHA] {nombre} detectado en el HTML")
    if re.search(r"just a moment|checking your browser|attention required", body, re.I):
        print("  [WAF] página de reto de Cloudflare detectada")
    if re.search(r'type=["\']hidden["\'][^>]*(website|honeypot)|(website|honeypot)[^>]*display:\s*none', body, re.I):
        print("  [ESTÁTICA] posible campo honeypot")
    p = urlparse(url); s2, _, robots = fetch(f"{p.scheme}://{p.netloc}/robots.txt")
    print("robots.txt:", s2, "|", (robots.strip().splitlines()[:3] if s2 == 200 else "no disponible"))

if __name__ == "__main__":
    for u in sys.argv[1:]: auditar(u)
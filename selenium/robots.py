# -*- coding: utf-8 -*-
"""Lectura de robots.txt (única implementación: la usan la auditoría y el bot de dataset)."""

import urllib.error
import urllib.request
import urllib.robotparser
from urllib.parse import urlparse, urlunparse


def consultar(base, ua="*"):
    """
    Descarga y analiza /robots.txt. Devuelve (estado, parser):
      estado = 'presente' | 'ausente' | 'bloqueado' | 'error'   (parser es None salvo en 'presente')
    """
    u = urlparse(base)
    url = urlunparse((u.scheme, u.netloc, "/robots.txt", "", "", ""))
    req = urllib.request.Request(url, headers={"User-Agent": ua if ua != "*" else "ProyectoAcademico/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            status, texto = r.status, r.read(300_000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        status, texto = e.code, ""
    except Exception:
        return "error", None
    if status in (401, 403):
        return "bloqueado", None
    if status != 200 or not texto.strip():
        return "ausente", None
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(texto.splitlines())
    return "presente", rp


def permitido(url, ua="*"):
    """Devuelve (True/False/None, mensaje). None = no se pudo consultar robots.txt."""
    estado, rp = consultar(url, ua)
    if estado == "presente":
        return rp.can_fetch(ua, url), "robots.txt consultado"
    if estado == "bloqueado":
        return False, "robots.txt devuelve 401/403 (acceso restringido)"
    if estado == "ausente":
        return True, "robots.txt ausente (sin restricciones declaradas)"
    return None, "no se pudo leer robots.txt"

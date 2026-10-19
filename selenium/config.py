# -*- coding: utf-8 -*-
"""Configuración general del proyecto."""

DB_NAME = "datos_web.db"        # Archivo de la base de datos SQLite
TIEMPO_ESPERA = 20              # Segundos máximos para esperas explícitas
TIMEOUT_CARGA_PAGINA = 45       # Segundos máximos para cargar una página
MIN_LEN_PARRAFO = 40            # Un párrafo es "significativo" si tiene >= N caracteres
MAX_MOSTRAR = 10                # Máximo de elementos por sección al mostrar datos
MAX_PAGINAS = 30                # Límite de páginas a visitar por rastreo
PAUSA_ENTRE_PAGINAS = 2         # Segundos entre páginas (pausa estratégica)

# True  = modo bot puro: si hay captcha NO se pide ayuda; se registra y se omite la página
# False = si hay captcha, el programa se pausa para que lo resuelvas manualmente
MODO_AUTOMATICO = False

# Enlaces que no son páginas HTML y no vale la pena visitar
EXTENSIONES_IGNORADAS = (
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".zip",
    ".rar", ".mp3", ".mp4", ".doc", ".docx", ".xls", ".xlsx", ".css", ".js",
)

# Frases típicas de pantallas anti-bot / captchas / bloqueos
PALABRAS_BLOQUEO = [
    "captcha", "verify you are human", "are you a robot", "unusual traffic",
    "access denied", "just a moment", "attention required", "checking your browser",
    "verifica que eres humano", "no soy un robot", "acceso denegado",
    "too many requests", "demasiadas solicitudes",
]

# Selectores CSS que delatan un captcha (reCAPTCHA, hCaptcha, Turnstile o uno propio)
SELECTORES_CAPTCHA = [
    "iframe[src*='recaptcha']",
    "iframe[src*='hcaptcha']",
    "iframe[src*='turnstile']",
    ".g-recaptcha",
    ".h-captcha",
    ".cf-turnstile",
    "[id*='captcha' i]",
    "[class*='captcha' i]",
    "[name*='captcha' i]",
    "img[src*='captcha' i]",
]
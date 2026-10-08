# Extractor Selenium

Requisitos: Python 3.10+, Google Chrome instalado y la app corriendo (`npm run dev`).

```bash
cd selenium
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export SCRAPER_API_KEY="la-misma-clave-de-.env.local"   # Windows PowerShell: $env:SCRAPER_API_KEY="..."
python extractor.py --base-url http://localhost:3000
```

Opciones: `--headed` (ver el navegador), `--no-upload` (solo archivos), `--max-posts N`, `--timeout S`.
Salida en `selenium/output/`: `resultado_extraccion.json`, `resultado_extraccion.csv` y una copia con fecha.
Con `SCRAPER_API_KEY` el resumen se guarda en Firestore (`scraping_results`) y genera logs; se ve en `/admin/analisis`.

Alcance ético: solo páginas públicas del propio sitio. No inicia sesión, no resuelve ni evade CAPTCHA, no toca cookies.

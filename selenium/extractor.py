#!/usr/bin/env python3
"""
Extractor Selenium de Café & Charla.

Recorre SOLO las páginas públicas del propio sitio (sin iniciar sesión, sin resolver CAPTCHA,
sin cookies ni contenido privado). Extrae title, h1-h3, p, a, img, ul/ol, meta y table, además de
productos, promociones, publicaciones, comentarios y reseñas. Genera:
  - output/resultado_extraccion.json   (datos completos, siempre el último)
  - output/resultado_extraccion.csv    (una fila por página)
  - output/resultado_extraccion_<fecha>.json (copia histórica)
y, si hay SCRAPER_API_KEY, envía un resumen a /api/admin/scraping (Firestore + logs) que alimenta /admin/analisis.

Uso:  python extractor.py --base-url http://localhost:3000
"""
import argparse, csv, hashlib, hmac, json, os, sys, time, urllib.error, urllib.request
from collections import Counter
from datetime import datetime, timezone
from urllib.parse import urlparse

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

PAGES = ["/", "/menu", "/promociones", "/foro", "/resenas", "/nosotros", "/ubicacion", "/contacto"]
OUT_NAME = "resultado_extraccion"

# Espera a que termine de cargar (las páginas leen Firestore en el cliente y muestran "Cargando…").
READY_JS = "return document.readyState==='complete' && !Array.from(document.querySelectorAll('[role=status]')).some(e=>/Cargando|Verificando/.test(e.textContent)) && !/…\\s+comentarios/.test(document.body.innerText)"

# Recolecta las etiquetas HTML pedidas en una sola pasada sobre el DOM renderizado.
COLLECT_JS = r"""
const t = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
const q = s => Array.from(document.querySelectorAll(s));
return {
  title: document.title,
  h1: q('h1').map(t), h2: q('h2').map(t), h3: q('h3').map(t),
  paragraphs: q('p').map(t).filter(Boolean),
  links: q('a[href]').map(a => ({text: t(a), href: a.href})),
  images: q('img').map(i => ({src: i.currentSrc || i.src, alt: i.getAttribute('alt')})),
  lists: q('ul,ol').map(l => ({tag: l.tagName.toLowerCase(), items: l.children.length})),
  meta: q('meta').map(m => ({name: m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('charset') || m.getAttribute('http-equiv') || '', content: m.getAttribute('content') || ''})),
  tables: q('table').map(tb => ({rows: tb.rows.length, headers: Array.from(tb.querySelectorAll('th')).map(t)}))
};
"""
# El sitio rota cada hora el NOMBRE del atributo que marca sus elementos (data-x<sal>="menu-item"), por eso no se usan
# selectores CSS fijos: la sal vigente se lee de <body data-ds> en cada página y se pasa al script (arguments[0]).
HK = r"""const S = arguments[0]; const hk = (n, root = document) => Array.from(root.querySelectorAll('[data-' + S + '="' + n + '"]')); const tx = e => e ? e.textContent.trim() : ''; """
CARDS_JS = {
 "menu": HK + r"""return hk('menu-item').map(li => { const m = tx(hk('menu-meta', li)[0]); return {name: tx(hk('menu-name', li)[0]), price: parseFloat(tx(hk('menu-price', li)[0]).replace(/[^0-9.]/g,'')), category: m.split('·')[0].trim(), soldOut: /Agotado/.test(m)}; });""",
 "promos": HK + r"""return hk('promo-item').map(li => ({title: tx(hk('promo-title', li)[0]), discount: tx(hk('promo-discount', li)[0])}));""",
 "posts": HK + r"""return hk('post-item').map(li => { const a = hk('post-link', li)[0]; const m = tx(hk('post-meta', li)[0]).match(/(\d+)\s+comentarios/); return {title: tx(a), href: a ? a.href : '', comments: m ? parseInt(m[1],10) : 0}; });""",
 "reviews": HK + r"""return hk('review-item').map(li => { const s = hk('review-rating', li)[0]; const r = s ? s.querySelector('[role=img]') : null; const m = r ? (r.getAttribute('aria-label')||'').match(/(\d)/) : null; return {rating: m ? parseInt(m[1],10) : null}; });""",
 "post_comments": HK + r"""const h = hk('comments-heading')[0]; const m = h ? h.textContent.match(/\((\d+)\)/) : null; return m ? parseInt(m[1],10) : 0;""",
}

def cards(driver, name):
    """Ejecuta el extractor de tarjetas con la sal de DOM vigente de la página actual."""
    salt = driver.execute_script("return document.body.getAttribute('data-ds')") or ""
    return driver.execute_script(CARDS_JS[name], salt)

def cap(lst, n): return lst[:n]
def now_iso(): return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def make_driver(headed):
    o = Options()
    if not headed: o.add_argument("--headless=new")
    o.add_argument("--window-size=1366,900"); o.add_argument("--lang=es-MX")
    return webdriver.Chrome(options=o)  # Selenium Manager descarga el driver automáticamente

def visit(driver, url, timeout):
    """Visita una URL pública y devuelve su registro de extracción (o el error)."""
    rec = {"url": url, "status": "ok", "error": None}
    try:
        driver.get(url)
        WebDriverWait(driver, timeout).until(lambda d: d.execute_script(READY_JS))
        time.sleep(0.6)  # hidratación de React
        rec.update(driver.execute_script(COLLECT_JS))
        if any("Página no encontrada" in h for h in rec["h1"]):
            rec.update(status="error", error="La página respondió 404")
    except (TimeoutException, WebDriverException) as e:
        rec.update(status="error", error=(str(e).splitlines() or ["error"])[0][:200])
    return rec

def post_json(endpoint, key, payload):
    req = urllib.request.Request(endpoint, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-scraper-key": key})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        print(f"  ! El servidor rechazó el envío ({e.code}): {e.read().decode()[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"  ! No se pudo enviar al servidor: {e}", file=sys.stderr)
    return None

def run(args):
    base = args.base_url.rstrip("/")
    pages, products, promos, posts, reviews, errors = [], [], [], [], [], []
    driver = make_driver(args.headed)
    try:
        key = os.environ.get("SCRAPER_API_KEY", "")
        if key and not args.anonymous:
            # Excepción AUTORIZADA: cookie firmada, con caducidad y solo para este host. El sitio la reconoce, la audita
            # (veredicto "extractor autorizado") y le aplica su propia política de rate limit. No evade CAPTCHA ni bloqueos.
            driver.get(base + "/")
            ts = str(int(time.time()))
            sig = hmac.new(key.encode(), f"scraper:{ts}".encode(), hashlib.sha256).hexdigest()
            driver.add_cookie({"name": "ab_scraper", "value": f"{ts}.{sig}", "path": "/"})
        for path in PAGES:
            rec = visit(driver, base + path, args.timeout); rec["path"] = path; pages.append(rec)
            print(f"  [{rec['status']:>5}] {path}")
            if rec["status"] != "ok":
                errors.append(f"{path}: {rec['error']}"); continue
            if path == "/menu": products = cards(driver, "menu")
            elif path == "/promociones": promos = cards(driver, "promos")
            elif path == "/resenas": reviews = cards(driver, "reviews")
            elif path == "/foro": posts = cards(driver, "posts")
        # Cada publicación debe ser accesible; se cuentan sus comentarios reales.
        for p in posts[: args.max_posts]:
            rec = visit(driver, p["href"], args.timeout); rec["path"] = urlparse(p["href"]).path; pages.append(rec)
            if rec["status"] == "ok": p["commentsDetail"] = cards(driver, "post_comments"); p["accessible"] = bool(rec["h1"])
            else: p["accessible"] = False; errors.append(f"{rec['path']}: {rec['error']}")
            print(f"  [{rec['status']:>5}] {rec['path']}")
    finally:
        driver.quit()
    return base, pages, products, promos, posts, reviews, errors

def summarize(base, pages, products, promos, posts, reviews, errors, started, executed_at, out_file):
    ok_pages = [p for p in pages if p["status"] == "ok"]
    prices = [p["price"] for p in products if isinstance(p.get("price"), (int, float)) and p["price"] == p["price"]]
    all_links = [l for p in ok_pages for l in p["links"]]
    all_imgs = [i for p in ok_pages for i in p["images"]]
    comments = sum(p.get("commentsDetail", p.get("comments", 0)) for p in posts)
    seen, uniq_links = set(), []
    for l in all_links:
        if l["href"] not in seen: seen.add(l["href"]); uniq_links.append({"text": l["text"][:80], "href": l["href"]})
    checks = [
        {"name": "El menú contiene productos", "ok": len(products) > 0, "detail": f"{len(products)} productos"},
        {"name": "Existen promociones vigentes", "ok": len(promos) > 0, "detail": f"{len(promos)} promociones"},
        {"name": "Las publicaciones son accesibles", "ok": bool(posts) and all(p.get("accessible") for p in posts[:15]), "detail": f"{len(posts)} publicaciones en el foro"},
        {"name": "Todas las páginas cargan sin error", "ok": not errors, "detail": f"{len(errors)} con error"},
        {"name": "Todas las páginas tienen un h1", "ok": all(p["h1"] for p in ok_pages) and bool(ok_pages), "detail": f"{sum(1 for p in ok_pages if not p['h1'])} sin h1"},
        {"name": "Las imágenes tienen texto alternativo", "ok": all(i["alt"] is not None for i in all_imgs), "detail": f"{sum(1 for i in all_imgs if i['alt'] is None)} sin alt"},
    ]
    home = next((p for p in ok_pages if p["path"] == "/"), None)
    details = {
        "baseUrl": base,
        "pages": [{"path": p["path"], "status": p["status"], "error": p["error"], "title": p.get("title", ""), "h1": cap(p.get("h1", []), 3),
                   "h2": len(p.get("h2", [])), "h3": len(p.get("h3", [])), "paragraphs": len(p.get("paragraphs", [])), "links": len(p.get("links", [])),
                   "images": len(p.get("images", [])), "lists": len(p.get("lists", [])), "tables": len(p.get("tables", [])), "meta": len(p.get("meta", []))} for p in pages],
        "categories": dict(Counter(p["category"] for p in products if p.get("category"))),
        "price": {"min": min(prices), "max": max(prices), "avg": round(sum(prices) / len(prices), 2)} if prices else None,
        "headings": cap([{"level": lv, "text": t[:100], "page": p["path"]} for p in ok_pages for lv in ("h1", "h2", "h3") for t in p[lv]], 60),
        "links": cap(uniq_links, 60),
        "images": cap([{"src": i["src"][:200], "alt": i["alt"]} for i in all_imgs], 40),
        "imagesWithoutAlt": sum(1 for i in all_imgs if i["alt"] is None),
        "tables": cap([{"page": p["path"], **t} for p in ok_pages for t in p["tables"]], 10),
        "meta": cap(home["meta"] if home else [], 20),
        "postTitles": cap([p["title"][:120] for p in posts], 30),
        "checks": checks, "errors": cap(errors, 20),
    }
    return {
        "executedAt": executed_at, "status": "success" if ok_pages and not errors else "error",
        "pagesVisited": len(ok_pages), "productsFound": len(products), "promotionsFound": len(promos), "postsFound": len(posts),
        "commentsFound": comments, "reviewsFound": len(reviews), "imagesFound": len(all_imgs), "linksFound": len(all_links),
        "duration": round(time.time() - started, 1), "outputFile": out_file, "details": details,
    }

def write_outputs(out_dir, summary, raw):
    os.makedirs(out_dir, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    full = {**summary, **raw}
    for name in (f"{OUT_NAME}.json", f"{OUT_NAME}_{stamp}.json"):
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as f: json.dump(full, f, ensure_ascii=False, indent=2)
    with open(os.path.join(out_dir, f"{OUT_NAME}.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f); w.writerow(["url", "estado", "title", "h1", "h2", "h3", "p", "a", "img", "ul_ol", "meta", "table"])
        for p in raw["pagesRaw"]:
            w.writerow([p["url"], p["status"], p.get("title", ""), " | ".join(p.get("h1", [])), len(p.get("h2", [])), len(p.get("h3", [])), len(p.get("paragraphs", [])),
                        len(p.get("links", [])), len(p.get("images", [])), len(p.get("lists", [])), len(p.get("meta", [])), len(p.get("tables", []))])

def main():
    ap = argparse.ArgumentParser(description="Extractor Selenium de Café & Charla (solo contenido público).")
    ap.add_argument("--base-url", default="http://localhost:3000"); ap.add_argument("--out-dir", default=os.path.join(os.path.dirname(__file__), "output"))
    ap.add_argument("--timeout", type=int, default=30); ap.add_argument("--max-posts", type=int, default=15)
    ap.add_argument("--headed", action="store_true", help="Mostrar el navegador"); ap.add_argument("--no-upload", action="store_true", help="No enviar resultados al servidor")
    ap.add_argument("--anonymous", action="store_true", help="No usar la cookie autorizada: el sitio debe detectar al extractor como automatización (demostración)")
    args = ap.parse_args()

    key = os.environ.get("SCRAPER_API_KEY", ""); endpoint = os.environ.get("SCRAPER_ENDPOINT", args.base_url.rstrip("/") + "/api/admin/scraping")
    upload = bool(key) and not args.no_upload
    if not upload: print("Aviso: sin SCRAPER_API_KEY (o --no-upload): los resultados solo se guardarán en archivos.")
    started, executed_at = time.time(), now_iso()
    if upload: post_json(endpoint, key, {"phase": "start"})
    print(f"Extrayendo {args.base_url} …")
    try:
        base, pages, products, promos, posts, reviews, errors = run(args)
        summary = summarize(base, pages, products, promos, posts, reviews, errors, started, executed_at, f"{OUT_NAME}.json")
        raw = {"pagesRaw": pages, "products": products, "promotions": promos, "posts": posts, "reviews": reviews}
    except Exception as e:  # p. ej. Chrome no disponible o servidor apagado
        print(f"Error fatal: {e}", file=sys.stderr)
        summary = {"executedAt": executed_at, "status": "error", "pagesVisited": 0, "productsFound": 0, "promotionsFound": 0, "postsFound": 0, "commentsFound": 0,
                   "reviewsFound": 0, "imagesFound": 0, "linksFound": 0, "duration": round(time.time() - started, 1), "outputFile": "",
                   "details": {"errors": [str(e)[:200]], "checks": [], "pages": []}}
        raw = {"pagesRaw": [], "products": [], "promotions": [], "posts": [], "reviews": []}
    if summary["outputFile"]: write_outputs(args.out_dir, summary, raw); print(f"Archivos escritos en {args.out_dir}")
    if upload and post_json(endpoint, key, {"phase": "finish", "result": summary}): print("Resumen enviado a Firestore y registrado en los logs.")
    print(f"Estado: {summary['status']} · páginas: {summary['pagesVisited']} · productos: {summary['productsFound']} · publicaciones: {summary['postsFound']} · {summary['duration']} s")
    sys.exit(0 if summary["status"] == "success" else 1)

if __name__ == "__main__":
    main()

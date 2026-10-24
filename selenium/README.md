# Proyecto Selenium unificado: Selenium → Pandas → SQLite

Un solo proyecto, una sola base de datos (`datos_web.db`) y un solo navegador/detector de captchas.

```
Selenium (navegar, filtrar, paginar)  →  Pandas (limpiar, normalizar)  →  SQLite  →  CSV / JSON / Excel
```

## Instalación (Windows PowerShell, dentro de la carpeta `selenium`)

```powershell
.\.venv\Scripts\Activate.ps1          # si falla: Set-ExecutionPolicy -Scope Process Bypass
pip install -r requirements.txt
python main.py
```

## Menú de `main.py`

| Opción | Qué hace | Módulos |
|---|---|---|
| 1 | Rastrea una URL o todo el sitio (títulos, h1-h3, enlaces, imágenes, párrafos) → SQLite | `rastreador`, `extractor`, `database` |
| 2 | Muestra lo almacenado y los bloqueos detectados | `consultas` |
| **3** | **Dataset estructurado**: filtros + paginación → limpieza Pandas → tabla `registros` + CSV/JSON/Excel | `portal_bot`, `portal_datos` |
| **4** | **Verifica el dataset** (tipos, nulos, duplicados, estadísticas, veredicto) | `verificar_dataset` |
| 5 | Exporta toda la base (un CSV por tabla + `base_completa.xlsx`) | `portal_datos.exportar_tablas` |
| 6 / 7 | Audita el nivel de protección de sitios / ve y exporta auditorías | `Auditoria` |

## Entregable «Base de datos / Dataset procesado»

1. `python main.py` → opción **3** (o por línea de comandos, ver abajo).
2. Opción **4** para comprobar que está «LISTO PARA ANÁLISIS».
3. Entrega: `datos_web.db` (tabla `registros`) y `output/registros.csv`, `registros.json`, `registros.xlsx`
   (hojas `datos`, `descartados`, `resumen`).

### Línea de comandos (equivalente a la opción 3)

```powershell
python portal_bot.py --perfil local --csv --json --excel                       # app en http://localhost:3000/menu
python portal_bot.py --perfil local --url https://tu-app.vercel.app --excel     # app desplegada (sin protección de login)
python portal_bot.py --perfil local --filtro categoria=Café --csv                # una sola categoría
```

> Si la URL de Vercel redirige a `vercel.com/login`, el bot se detiene y lo avisa: desactiva *Deployment Protection*
> en Vercel, usa el dominio de producción o corre la app en local. El bot no inicia sesión ni evade nada.

## Limpieza con Pandas (`portal_datos.py`)

- Quita caracteres especiales/invisibles (ancho cero, BOM, controles) y normaliza espacios y saltos de línea.
- «-», «N/A», «S/D», etc. → nulos reales.
- Números: `"$1,234.50"` → `1234.5` (formato decimal configurable por perfil).
- Fechas: se normalizan a `AAAA-MM-DD` (columnas indicadas en `limpieza["fechas"]`, con formato explícito o `dayfirst`).
- Duplicados eliminados con `id_registro` (hash) y guardado `INSERT OR IGNORE`: repetir la ejecución no duplica.
- Lo que no se puede convertir queda nulo y se cuenta; los registros sin campos obligatorios van a `descartados` con su motivo.
- Se conserva la fila original (`_original`) para auditoría.

## Estructura (sin duplicados)

| Archivo | Responsabilidad única |
|---|---|
| `config.py` | Todos los parámetros (BD, esperas, límites, listas de captcha) |
| `navegador.py` | Crear/reutilizar/cerrar Chrome (con o sin `--headless`) |
| `bloqueos.py` | Detectar captcha/bloqueo; pedir ayuda humana; **nunca** lo resuelve ni lo evade |
| `robots.py` | Leer robots.txt (lo usan `Auditoria` y `portal_bot`) |
| `utilidades.py` | Limpieza de texto (una sola función, también usada por Pandas), URLs, esperas |
| `database.py` | Tablas y escritura del rastreador y de los bloqueos |
| `portal_datos.py` | Pandas + SQLite del dataset + exportaciones |
| `portal_bot.py` | Perfiles de portal, filtros, paginación y flujo completo |
| `verificar_dataset.py` | Informe de calidad del dataset |
| `pruebas_app_propia/` | Scripts de pruebas anti-bot de tu propia app (solo localhost) y el extractor a Firestore (`extractor_firestore.py`) |

Eliminados por duplicar funciones: `auditar_sitio.py` (lo cubre `Auditoria.py`), `pandasYselenium` (plantilla de ejemplo)
y el `extractor.py` de Firestore, que se movió a `pruebas_app_propia/extractor_firestore.py` porque chocaba de nombre con el
`extractor.py` del rastreador.

Alcance ético: solo páginas públicas o propias, con pausas, respetando robots.txt y sin evadir captchas ni bloqueos.

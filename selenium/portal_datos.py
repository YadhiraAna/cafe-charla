"""
Procesamiento (Pandas) y almacenamiento persistente (SQLite / CSV / JSON / Excel).
No depende del portal: todo se controla con el diccionario "limpieza" del perfil.
Sirve tanto para el dataset de portal_bot.py como para exportar cualquier tabla de la base del proyecto.
"""
import hashlib
import json
import os
import re
import sqlite3
from datetime import datetime

import pandas as pd
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE

from utilidades import limpiar_texto

NULOS = {"", "-", "--", "n/a", "na", "s/d", "sin dato", "null", "none", "nan"}  # solo estos textos cuentan como "vacío"
IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class ErrorAlmacenamiento(Exception):
    """Fallo al guardar o leer la base de datos."""


def _texto(serie):
    """Quita caracteres especiales/invisibles, normaliza espacios y convierte 'sin dato' en nulos reales."""
    s = serie.astype("string").map(lambda v: v if pd.isna(v) else limpiar_texto(v)).astype("string")
    return s.mask(s.str.lower().isin(NULOS))


def _numero(serie, decimal):
    """Convierte texto a número. decimal=',' para formatos como 1.234,50 y '.' para 1,234.50."""
    s = serie.astype("string")
    if decimal == ",":
        s = s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    else:
        s = s.str.replace(",", "", regex=False)
    return pd.to_numeric(s.str.replace(r"[^0-9.\-]", "", regex=True), errors="coerce")


def _fecha(serie, formato, dayfirst):
    """Convierte fechas sin cambiar su significado.
    - Con 'formato' explícito se usa tal cual (lo más seguro).
    - Si empieza por el año (2024-03-10, 2024/03/10) se lee SIEMPRE como año-mes-día.
    - El resto (05/03/2024) se lee día/mes/año si dayfirst=True, o mes/día/año si es False."""
    if formato:
        return pd.to_datetime(serie, format=formato, errors="coerce")
    s = serie.astype("string")
    anio_primero = s.str.match(r"^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}", na=False)
    out = pd.Series(pd.NaT, index=serie.index, dtype="datetime64[ns]")
    if anio_primero.any():
        out[anio_primero] = pd.to_datetime(s[anio_primero], format="mixed", dayfirst=False, errors="coerce")
    if (~anio_primero).any():
        out[~anio_primero] = pd.to_datetime(s[~anio_primero], format="mixed", dayfirst=dayfirst, errors="coerce")
    return out


def procesar(registros, cfg):
    """Devuelve (limpios, descartados, resumen). No inventa valores: lo que no se puede convertir queda nulo y se cuenta."""
    cols, obl, clave = cfg["columnas"], cfg.get("obligatorias", []), cfg["clave"]
    extra = ["id_registro", "fecha_extraccion", "_original"]
    resumen = {"extraidos": len(registros), "validos": 0, "descartados": 0, "duplicados": 0,
               "nulos": {}, "fechas_invalidas": 0, "numeros_invalidos": 0}
    if not registros:
        return pd.DataFrame(columns=cols + extra), pd.DataFrame(columns=cols + extra + ["motivo_descarte"]), resumen

    df = pd.DataFrame(registros)
    df["_original"] = [json.dumps(r, ensure_ascii=False, sort_keys=True, default=str) for r in registros]  # copia para auditoría
    for c in cols:
        if c not in df.columns:
            df[c] = pd.NA
    df = df[cols + ["_original"]].copy()

    for c in cols:
        df[c] = _texto(df[c])
    for c in cfg.get("fechas", []):
        conv = _fecha(df[c], cfg.get("formato_fecha"), cfg.get("dayfirst", True))
        resumen["fechas_invalidas"] += int((df[c].notna() & conv.isna()).sum())
        df[c] = conv.dt.strftime("%Y-%m-%d")
    for c in cfg.get("numericas", []):
        conv = _numero(df[c], cfg.get("decimal", "."))
        resumen["numeros_invalidos"] += int((df[c].notna() & conv.isna()).sum())
        df[c] = conv
    resumen["nulos"] = {c: int(df[c].isna().sum()) for c in cols}

    df["id_registro"] = df.apply(lambda f: hashlib.sha1(
        "|".join("" if pd.isna(f[c]) else str(f[c]).strip().lower() for c in clave).encode("utf-8")).hexdigest()[:16], axis=1)
    df["fecha_extraccion"] = datetime.now().isoformat(timespec="seconds")

    # Solo se descartan los registros a los que les falta un campo OBLIGATORIO; los demás nulos se conservan.
    faltan = df[obl].isna() if obl else pd.DataFrame(False, index=df.index, columns=["_"])
    sin_obl = faltan.any(axis=1)
    motivos = faltan.apply(lambda r: "falta: " + ", ".join(str(i) for i in r.index[r.values]), axis=1)
    validos = df[~sin_obl]
    dup = validos.duplicated("id_registro", keep="first")
    descartados = pd.concat([df[sin_obl].assign(motivo_descarte=motivos[sin_obl]),
                             validos[dup].assign(motivo_descarte="duplicado en la extracción")])
    limpios = validos[~dup].reset_index(drop=True)
    resumen.update(validos=len(limpios), descartados=len(descartados), duplicados=int(dup.sum()))
    return limpios, descartados, resumen


def mostrar(df, cols, filas=15):
    """Imprime una vista limitada de la tabla, indicando el total de registros."""
    if df.empty:
        print("  (tabla vacía)")
        return
    with pd.option_context("display.max_columns", None, "display.width", 200, "display.max_colwidth", 40):
        print(df[cols + ["id_registro"]].head(filas).to_string())
    print(f"\n  Mostrando {min(filas, len(df))} de {len(df)} registros.")


def guardar(limpios, ruta_db, tabla, cfg):
    """Guarda en SQLite con INSERT OR IGNORE sobre id_registro: repetir la ejecución no duplica. Es una sola transacción."""
    cols = cfg["columnas"]
    if not IDENT.match(tabla) or not all(IDENT.match(c) for c in cols):
        raise ErrorAlmacenamiento("Nombre de tabla o de columna no válido (solo letras, números y guion bajo).")
    num = set(cfg.get("numericas", []))
    defs = ", ".join(f'"{c}" {"REAL" if c in num else "TEXT"}' for c in cols)
    todas = cols + ["id_registro", "fecha_extraccion", "_original"]

    def valor(c, v):
        return None if pd.isna(v) else (float(v) if c in num else str(v))

    filas = [tuple(valor(c, v) for c, v in zip(todas, fila)) for fila in limpios[todas].itertuples(index=False, name=None)]
    try:
        con = sqlite3.connect(ruta_db)
        try:
            with con:  # transacción: si algo falla se revierte y la base no queda a medias
                con.execute(f'CREATE TABLE IF NOT EXISTS "{tabla}" ({defs}, id_registro TEXT PRIMARY KEY, fecha_extraccion TEXT, _original TEXT)')
                antes = con.total_changes
                con.executemany(f'INSERT OR IGNORE INTO "{tabla}" ({", ".join(todas)}) VALUES ({", ".join("?" * len(todas))})', filas)
                nuevos = con.total_changes - antes
            total = con.execute(f'SELECT COUNT(*) FROM "{tabla}"').fetchone()[0]
        finally:
            con.close()
    except sqlite3.Error as e:
        raise ErrorAlmacenamiento(f"No se pudo guardar en SQLite: {e}") from e
    return {"nuevos": nuevos, "ya_existian": len(filas) - nuevos, "total_en_tabla": total}


def leer(ruta_db, tabla):
    """Recupera lo guardado como DataFrame (para comprobar que lo almacenado coincide con lo extraído)."""
    if not IDENT.match(tabla):
        raise ErrorAlmacenamiento("Nombre de tabla no válido.")
    try:
        con = sqlite3.connect(ruta_db)
        try:
            return pd.read_sql_query(f'SELECT * FROM "{tabla}"', con)
        finally:
            con.close()
    except (sqlite3.Error, pd.errors.DatabaseError) as e:
        raise ErrorAlmacenamiento(f"No se pudo leer la tabla '{tabla}': {e}") from e


# ───────────────────────────── Exportación (CSV / JSON / Excel) ─────────────────────────────
def _para_excel(df):
    """Quita los caracteres que Excel no admite (evita IllegalCharacterError)."""
    df = df.copy()
    for c in df.select_dtypes(include=["object", "string"]).columns:
        df[c] = df[c].map(lambda v: ILLEGAL_CHARACTERS_RE.sub("", v) if isinstance(v, str) else v)
    return df


def exportar_dataset(rec, descartados, resumen, tabla, carpeta, csv=False, json_=False, excel=False):
    """Exporta el dataset final (lo recuperado de SQLite) junto con el informe de calidad. Devuelve las rutas creadas."""
    os.makedirs(carpeta, exist_ok=True)
    datos = rec.drop(columns=["_original"], errors="ignore")
    rutas = []
    if csv:
        ruta = os.path.join(carpeta, f"{tabla}.csv")
        datos.to_csv(ruta, index=False, encoding="utf-8-sig")  # utf-8-sig: Excel abre bien los acentos
        rutas.append(ruta)
    if json_:
        ruta = os.path.join(carpeta, f"{tabla}.json")
        datos.to_json(ruta, orient="records", force_ascii=False, indent=2)
        rutas.append(ruta)
    if excel:
        ruta = os.path.join(carpeta, f"{tabla}.xlsx")
        filas = [("registros extraídos", resumen["extraidos"]), ("registros válidos", resumen["validos"]),
                 ("descartados", resumen["descartados"]), ("duplicados en la extracción", resumen["duplicados"]),
                 ("fechas inválidas", resumen["fechas_invalidas"]), ("números inválidos", resumen["numeros_invalidos"])]
        filas += [(f"nulos en {c}", n) for c, n in resumen["nulos"].items()]
        with pd.ExcelWriter(ruta, engine="openpyxl") as xw:
            _para_excel(datos).to_excel(xw, sheet_name="datos", index=False)
            _para_excel(descartados.drop(columns=["_original"], errors="ignore")).to_excel(xw, sheet_name="descartados", index=False)
            pd.DataFrame(filas, columns=["indicador", "valor"]).to_excel(xw, sheet_name="resumen", index=False)
        rutas.append(ruta)
    return rutas


def exportar_tablas(ruta_db, carpeta, tablas=None, excel_nombre="base_completa.xlsx"):
    """Vuelca tablas de la base a un CSV por tabla y a un único Excel (una hoja por tabla). Devuelve las rutas creadas."""
    os.makedirs(carpeta, exist_ok=True)
    try:
        con = sqlite3.connect(ruta_db)
        try:
            existentes = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            elegidas = [t for t in (tablas or existentes) if t in existentes]
            frames = {t: pd.read_sql_query(f'SELECT * FROM "{t}"', con).drop(columns=["_original"], errors="ignore") for t in elegidas}
        finally:
            con.close()
    except sqlite3.Error as e:
        raise ErrorAlmacenamiento(f"No se pudo leer la base '{ruta_db}': {e}") from e
    if not frames:
        return []
    rutas = []
    for t, df in frames.items():
        ruta = os.path.join(carpeta, f"{t}.csv")
        df.to_csv(ruta, index=False, encoding="utf-8-sig")
        rutas.append(ruta)
    ruta_x = os.path.join(carpeta, excel_nombre)
    with pd.ExcelWriter(ruta_x, engine="openpyxl") as xw:
        for t, df in frames.items():
            _para_excel(df).to_excel(xw, sheet_name=t[:31], index=False)
    rutas.append(ruta_x)
    return rutas

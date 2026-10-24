#!/usr/bin/env python3
"""Verifica que el dataset final (SQLite) esté estructurado, limpio y listo para análisis.
Uso:  python verificar_dataset.py [ruta_db] [tabla]      (también desde el menú de main.py, opción 4)
Valores por defecto: la base del proyecto (config.DB_NAME) y la tabla 'registros'."""
import re
import sqlite3
import sys

import pandas as pd

import config


def verificar(ruta=config.DB_NAME, tabla=config.TABLA_DATASET):
    """Imprime el informe de calidad. Devuelve True si el dataset está listo para análisis."""
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", tabla):
        print("Nombre de tabla no válido.")
        return False
    try:
        con = sqlite3.connect(ruta)
        df = pd.read_sql_query(f'SELECT * FROM "{tabla}"', con)
        tipos = pd.read_sql_query(f'PRAGMA table_info("{tabla}")', con)[["name", "type"]]
        con.close()
    except Exception as e:
        print(f"No se pudo leer '{tabla}' en {ruta}: {e}\nEjecuta primero portal_bot.py (o la opción 3 del menú) para crear el dataset.")
        return False

    datos = [c for c in df.columns if c not in ("id_registro", "fecha_extraccion", "_original")]
    print(f"\n=== 1) CONTENIDO ===\nBase: {ruta} · tabla: {tabla} · {len(df)} registros · {len(datos)} columnas de datos")
    print("\n=== 2) COLUMNAS Y TIPOS (SQLite) ===")
    print(tipos.to_string(index=False))
    print("\n=== 3) VALORES NULOS POR COLUMNA ===")
    nulos = df[datos].isna().sum()
    print(pd.DataFrame({"nulos": nulos, "porcentaje": (nulos / max(len(df), 1) * 100).round(1)}).to_string())
    print("\n=== 4) ESTADÍSTICAS DE COLUMNAS NUMÉRICAS ===")
    num = df[datos].select_dtypes("number")
    print(num.describe().round(2).to_string() if not num.empty else "(no hay columnas numéricas)")
    print("\n=== 5) COLUMNAS DE FECHA (mínimo y máximo) ===")
    fechas = [c for c in datos if "fecha" in c.lower()]
    for c in fechas:
        f = pd.to_datetime(df[c], errors="coerce")
        print(f"{c}: {f.min()} → {f.max()}  (no interpretables: {int(f.isna().sum() - df[c].isna().sum())})")
    if not fechas:
        print("(no hay columnas de fecha)")
    print("\n=== 6) VISTA PREVIA (10 filas) ===")
    print(df[datos].head(10).to_string())

    problemas = []
    if df.empty:
        problemas.append("la tabla está vacía")
    if df["id_registro"].duplicated().any():
        problemas.append("hay id_registro repetidos")
    vacias = [c for c in datos if df[c].isna().all()] if not df.empty else []
    if vacias:
        problemas.append(f"columnas completamente vacías: {vacias}")
    print("\n=== 7) VEREDICTO ===")
    print("LISTO PARA ANÁLISIS: sin duplicados, sin columnas vacías y con datos." if not problemas else "REVISAR: " + "; ".join(problemas))
    return not problemas


if __name__ == "__main__":
    sys.exit(0 if verificar(*(sys.argv[1:3])) else 1)

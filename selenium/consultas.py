# -*- coding: utf-8 -*-
"""Consulta y despliegue en consola de los datos almacenados."""

import sqlite3

from config import MAX_MOSTRAR


def _mostrar_seccion(titulo, filas, formatear):
    """Imprime una sección limitada a MAX_MOSTRAR elementos."""
    print(f"\n  {titulo} ({len(filas)}):")
    if not filas:
        print("    (sin elementos)")
        return
    for fila in filas[:MAX_MOSTRAR]:
        print(f"    - {formatear(fila)}")
    if len(filas) > MAX_MOSTRAR:
        print(f"    ... y {len(filas) - MAX_MOSTRAR} más")


def mostrar_datos(conn):
    """Consulta SQLite y muestra todo lo almacenado (o avisa si no hay nada)."""
    try:
        paginas = conn.execute(
            "SELECT id, url, titulo, fecha FROM paginas ORDER BY id"
        ).fetchall()

        if not paginas:
            print("\n[!] No hay datos disponibles. Realiza primero una extracción (opción 1).")
            return

        print(f"\n===== DATOS ALMACENADOS ({len(paginas)} extracciones) =====")
        for pagina_id, url, titulo, fecha in paginas:
            print("\n" + "=" * 70)
            print(f"ID: {pagina_id} | Fecha: {fecha}")
            print(f"URL: {url}")
            print(f"Título: {titulo or '(sin título)'}")

            encabezados = conn.execute(
                "SELECT nivel, texto FROM encabezados WHERE pagina_id = ?", (pagina_id,)
            ).fetchall()
            enlaces = conn.execute(
                "SELECT href, texto FROM enlaces WHERE pagina_id = ?", (pagina_id,)
            ).fetchall()
            imagenes = conn.execute(
                "SELECT src, alt FROM imagenes WHERE pagina_id = ?", (pagina_id,)
            ).fetchall()
            parrafos = conn.execute(
                "SELECT texto FROM parrafos WHERE pagina_id = ?", (pagina_id,)
            ).fetchall()

            _mostrar_seccion("Encabezados", encabezados,
                             lambda f: f"[{f[0].upper()}] {f[1][:100]}")
            _mostrar_seccion("Enlaces", enlaces,
                             lambda f: f"{f[0][:90]}  ({f[1][:40] or 'sin texto'})")
            _mostrar_seccion("Imágenes", imagenes,
                             lambda f: f"{f[0][:90]}  (alt: {f[1][:40] or 'sin alt'})")
            _mostrar_seccion("Párrafos", parrafos,
                             lambda f: f"{f[0][:120]}{'...' if len(f[0]) > 120 else ''}")
        print("\n" + "=" * 70)

    except sqlite3.Error as e:
        print(f"[ERROR] No se pudieron consultar los datos: {e}")


def mostrar_bloqueos(conn):
    """Muestra los captchas/bloqueos que se han detectado."""
    try:
        filas = conn.execute(
            "SELECT fecha, url, accion, motivos FROM eventos_bloqueo ORDER BY id"
        ).fetchall()
        print(f"\n===== CAPTCHAS / BLOQUEOS DETECTADOS ({len(filas)}) =====")
        if not filas:
            print("  (ninguno)")
        for fecha, url, accion, motivos in filas:
            print(f"  [{fecha}] {url}\n      acción: {accion} | motivos: {motivos[:150]}")
    except sqlite3.Error as e:
        print(f"[ERROR] No se pudieron consultar los bloqueos: {e}")
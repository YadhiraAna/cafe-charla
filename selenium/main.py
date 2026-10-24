# -*- coding: utf-8 -*-
"""
Punto de entrada único: menú interactivo por consola.

Flujo del proyecto:
  Selenium (navegar / filtrar / paginar) → Pandas (limpiar) → SQLite (almacenar) → CSV / JSON / Excel (exportar)

Uso:
    pip install -r requirements.txt
    python main.py
"""

import sqlite3

from selenium.common.exceptions import TimeoutException, WebDriverException

import config
import portal_bot
import portal_datos
import verificar_dataset
from Auditoria import auditar_sitios, mostrar_auditorias
from config import MAX_PAGINAS
from consultas import mostrar_bloqueos, mostrar_datos
from database import conectar_bd
from navegador import GestorNavegador
from rastreador import procesar_pagina, rastrear_sitio
from utilidades import normalizar_url


# ───────────────────────────── 1) Rastreo genérico (HTML → SQLite) ─────────────────────────────
def procesar_url(conn, navegador):
    """Pide la URL y ejecuta una extracción simple o un rastreo completo del sitio."""
    entrada = input("\nIngresa la URL a procesar (ej. https://example.com o localhost:5000): ")
    url = normalizar_url(entrada)
    if not url:
        print("[ERROR] La URL ingresada no es válida.")
        return

    completo = input("¿Recorrer TODOS los módulos del sitio? (s/n): ").strip().lower() == "s"

    try:
        if completo:
            limite = input(f"Máximo de páginas a visitar [{MAX_PAGINAS}]: ").strip()
            limite = int(limite) if limite.isdigit() and int(limite) > 0 else MAX_PAGINAS
            rastrear_sitio(conn, navegador, url, limite)
        else:
            driver = navegador.obtener()
            print(f"[*] Abriendo {url} ...")
            estado, datos = procesar_pagina(conn, driver, url)
            if datos is None:
                print(f"[!] No se extrajo nada (estado: {estado}).")
            else:
                print(f"\n[OK] Extracción guardada. Título: {datos['titulo'] or '(sin título)'}")
                print(f"     Encabezados: {len(datos['encabezados'])} | Enlaces: {len(datos['enlaces'])} | "
                      f"Imágenes: {len(datos['imagenes'])} | Párrafos: {len(datos['parrafos'])}")

    except TimeoutException:
        print("[ERROR] Tiempo de espera agotado: la página tardó demasiado en cargar.")
    except WebDriverException as e:
        mensaje = (e.msg or str(e)).splitlines()[0]
        print(f"[ERROR] Problema con el navegador o la conexión: {mensaje}")
    except sqlite3.Error as e:
        print(f"[ERROR] No se pudo guardar en la base de datos: {e}")
    except Exception as e:  # último recurso para que el menú nunca se caiga
        print(f"[ERROR] Error inesperado: {e}")


# ───────────────────────────── 3) Dataset estructurado (Selenium → Pandas → SQLite/CSV/JSON/Excel) ─────────────────────────────
def extraer_dataset(navegador):
    """Pregunta lo mínimo y delega en portal_bot.correr (el mismo flujo que la línea de comandos)."""
    print("\nPerfiles disponibles: " + ", ".join(portal_bot.PERFILES))
    perfil = input("Perfil [local]: ").strip() or "local"
    if perfil not in portal_bot.PERFILES:
        print("[ERROR] Perfil desconocido.")
        return
    url = input(f"URL (ENTER = {config.URL_PORTAL_PRUEBA}; puedes escribir solo el dominio de tu app): ").strip() or None
    buscar = input("Texto a buscar (ENTER = ninguno): ").strip() or None
    filtros = [f.strip() for f in input("Filtros CLAVE=VALOR separados por coma (ENTER = ninguno, ej. categoria=Café): ").split(",") if f.strip()]
    exportar = input("¿Exportar CSV, JSON y Excel a la carpeta output? (s/n) [s]: ").strip().lower() != "n"

    a = portal_bot.crear_parser().parse_args([])           # valores por defecto del bot
    a.perfil, a.url, a.buscar, a.filtro = perfil, url, buscar, filtros
    a.csv = a.json = a.excel = exportar
    a.acepto_terminos = input("¿Revisaste los términos de uso y robots.txt del sitio? (s/n) [n]: ").strip().lower() == "s" \
        if not portal_bot.PERFILES[perfil]["es_local"] else False
    try:
        portal_bot.correr(a, navegador)
    except (KeyboardInterrupt, EOFError):
        raise
    except Exception as e:
        print(f"[ERROR] Error inesperado en la extracción: {e}")


# ───────────────────────────── Auditoría ─────────────────────────────
def auditar(conn, navegador):
    entradas = input("URLs a auditar, separadas por coma: ").split(",")
    urls = [u for u in (normalizar_url(e) for e in entradas) if u]
    auditar_sitios(conn, navegador, urls)


def exportar(tablas=None):
    try:
        rutas = portal_datos.exportar_tablas(config.DB_NAME, config.DIR_SALIDA, tablas)
    except portal_datos.ErrorAlmacenamiento as e:
        print(f"[ERROR] {e}")
        return
    print("\n[OK] Archivos generados:" if rutas else "\n[!] No hay tablas para exportar todavía.")
    for r in rutas:
        print(f"     {r}")


# ───────────────────────────── Menú ─────────────────────────────
def mostrar_menu():
    print("\n" + "=" * 62)
    print("   EXTRACTOR WEB: SELENIUM + PANDAS + SQLITE")
    print("=" * 62)
    print(" -- Rastreo genérico (páginas HTML) --")
    print("[1] Ingresar URL / rastrear sitio")
    print("[2] Mostrar datos del rastreo y bloqueos detectados")
    print(" -- Dataset estructurado (filtros, paginación, limpieza) --")
    print("[3] Extraer dataset  (Selenium → Pandas → SQLite + CSV/JSON/Excel)")
    print("[4] Verificar dataset procesado")
    print("[5] Exportar toda la base (CSV por tabla + Excel)")
    print(" -- Auditoría de protección --")
    print("[6] Auditar sitios")
    print("[7] Ver auditorías y exportar a CSV")
    print("[8] Salir")


def main():
    conn = None
    navegador = GestorNavegador()
    try:
        conn = conectar_bd()
        while True:
            mostrar_menu()
            opcion = input("Elige una opción (1-8): ").strip()

            if opcion == "1":
                procesar_url(conn, navegador)
            elif opcion == "2":
                mostrar_datos(conn)
                mostrar_bloqueos(conn)
            elif opcion == "3":
                extraer_dataset(navegador)
            elif opcion == "4":
                verificar_dataset.verificar(config.DB_NAME, config.TABLA_DATASET)
            elif opcion == "5":
                exportar()
            elif opcion == "6":
                auditar(conn, navegador)
            elif opcion == "7":
                mostrar_auditorias(conn)
                exportar(["auditoria_sitios"])
            elif opcion == "8":
                print("\n[*] Saliendo del programa...")
                break
            else:
                print("[!] Opción no válida. Elige un número del 1 al 8.")

    except (KeyboardInterrupt, EOFError):
        print("\n[!] Interrupción detectada. Cerrando recursos...")
    except sqlite3.Error as e:
        print(f"[ERROR FATAL] Problema con la base de datos: {e}")
    finally:
        # Cierre ordenado: navegador primero, luego la conexión a SQLite
        navegador.cerrar()
        if conn is not None:
            conn.close()
            print("[*] Conexión con SQLite cerrada.")
        print("[*] Programa finalizado.")


if __name__ == "__main__":
    main()

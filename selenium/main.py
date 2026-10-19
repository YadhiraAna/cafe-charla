# -*- coding: utf-8 -*-
"""
Punto de entrada: menú interactivo por consola.

Uso:
    pip install -r requirements.txt
    python main.py
"""

import sqlite3

from selenium.common.exceptions import TimeoutException, WebDriverException

from config import MAX_PAGINAS
from consultas import mostrar_bloqueos, mostrar_datos
from database import conectar_bd
from navegador import GestorNavegador
from rastreador import procesar_pagina, rastrear_sitio
from utilidades import normalizar_url


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


def mostrar_menu():
    print("\n" + "=" * 50)
    print("       EXTRACTOR WEB CON SELENIUM + SQLITE")
    print("=" * 50)
    print("[1] Ingresar URL para iniciar extracción")
    print("[2] Mostrar datos")
    print("[3] Realizar otra consulta")
    print("[4] Salir")


def main():
    conn = None
    navegador = GestorNavegador()
    try:
        conn = conectar_bd()
        while True:
            mostrar_menu()
            opcion = input("Elige una opción (1-4): ").strip()

            if opcion in ("1", "3"):      # La opción 3 repite exactamente el flujo de la 1
                procesar_url(conn, navegador)
            elif opcion == "2":
                mostrar_datos(conn)
                mostrar_bloqueos(conn)
            elif opcion == "4":
                print("\n[*] Saliendo del programa...")
                break
            else:
                print("[!] Opción no válida. Elige un número del 1 al 4.")

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
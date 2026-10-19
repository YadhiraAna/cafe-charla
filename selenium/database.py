# -*- coding: utf-8 -*-
"""Conexión y escritura en la base de datos SQLite."""

import sqlite3
from datetime import datetime

from config import DB_NAME


def conectar_bd(ruta=DB_NAME):
    """Abre la conexión con SQLite y crea las tablas si no existen."""
    conn = sqlite3.connect(ruta)
    conn.execute("PRAGMA foreign_keys = ON;")  # Activa integridad referencial
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS paginas (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            url         TEXT NOT NULL,
            titulo      TEXT,
            fecha       TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS encabezados (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            pagina_id  INTEGER NOT NULL,
            nivel      TEXT NOT NULL,          -- h1, h2 o h3
            texto      TEXT NOT NULL,
            FOREIGN KEY (pagina_id) REFERENCES paginas(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS enlaces (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            pagina_id  INTEGER NOT NULL,
            href       TEXT NOT NULL,
            texto      TEXT,
            FOREIGN KEY (pagina_id) REFERENCES paginas(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS imagenes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            pagina_id  INTEGER NOT NULL,
            src        TEXT NOT NULL,
            alt        TEXT,
            FOREIGN KEY (pagina_id) REFERENCES paginas(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS parrafos (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            pagina_id  INTEGER NOT NULL,
            texto      TEXT NOT NULL,
            FOREIGN KEY (pagina_id) REFERENCES paginas(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS eventos_bloqueo (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            url       TEXT NOT NULL,
            motivos   TEXT NOT NULL,     -- qué se detectó (selector o texto)
            accion    TEXT NOT NULL,     -- omitida, resuelta_manual, forzada, cancelada
            fecha     TEXT NOT NULL
        );
        """
    )
    conn.commit()
    return conn


def guardar_datos(conn, url, datos):
    """
    Guarda una extracción completa de forma acumulativa (nunca borra lo anterior).
    Todo se inserta en una sola transacción: si algo falla, no queda nada a medias.
    Devuelve el id de la página registrada.
    """
    with conn:  # commit automático si todo sale bien, rollback si hay excepción
        cur = conn.execute(
            "INSERT INTO paginas (url, titulo, fecha) VALUES (?, ?, ?)",
            (url, datos["titulo"], datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        )
        pagina_id = cur.lastrowid

        conn.executemany(
            "INSERT INTO encabezados (pagina_id, nivel, texto) VALUES (?, ?, ?)",
            [(pagina_id, nivel, texto) for nivel, texto in datos["encabezados"]],
        )
        conn.executemany(
            "INSERT INTO enlaces (pagina_id, href, texto) VALUES (?, ?, ?)",
            [(pagina_id, href, texto) for href, texto in datos["enlaces"]],
        )
        conn.executemany(
            "INSERT INTO imagenes (pagina_id, src, alt) VALUES (?, ?, ?)",
            [(pagina_id, src, alt) for src, alt in datos["imagenes"]],
        )
        conn.executemany(
            "INSERT INTO parrafos (pagina_id, texto) VALUES (?, ?)",
            [(pagina_id, texto) for texto in datos["parrafos"]],
        )
    return pagina_id


def registrar_bloqueo(conn, url, motivos, accion):
    """Guarda en SQLite que se encontró un captcha/bloqueo en esta URL."""
    try:
        with conn:
            conn.execute(
                "INSERT INTO eventos_bloqueo (url, motivos, accion, fecha) VALUES (?, ?, ?, ?)",
                (url, " | ".join(motivos), accion, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
            )
    except sqlite3.Error as e:
        print(f"[ERROR] No se pudo registrar el bloqueo: {e}")
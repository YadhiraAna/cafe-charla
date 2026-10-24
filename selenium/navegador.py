# -*- coding: utf-8 -*-
"""Gestión del navegador automatizado (única implementación para rastreador, dataset y auditoría)."""

from selenium import webdriver
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

from config import TIMEOUT_CARGA_PAGINA


class GestorNavegador:
    """Crea el navegador bajo demanda, lo reutiliza y lo cierra de forma segura."""

    def __init__(self, headless=False):
        self.driver = None
        self.headless = headless

    def _crear_driver(self):
        opciones = Options()
        opciones.add_argument("--lang=es-MX")
        if self.headless:
            opciones.add_argument("--headless=new")
            opciones.add_argument("--window-size=1366,900")
        else:
            # Con ventana visible puedes resolver captchas manualmente.
            opciones.add_argument("--start-maximized")
        # No ocultamos que es un bot (navigator.webdriver = true): la automatización es transparente.
        try:
            from webdriver_manager.chrome import ChromeDriverManager
            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opciones)
        except Exception as e:
            print(f"    (webdriver-manager no disponible: {e}) -> se usa Selenium Manager")
            driver = webdriver.Chrome(options=opciones)
        driver.set_page_load_timeout(TIMEOUT_CARGA_PAGINA)
        return driver

    def obtener(self):
        """Devuelve un navegador vivo; si no existe o se cerró, crea uno nuevo."""
        if self.driver is not None:
            try:
                _ = self.driver.title  # prueba de que la sesión sigue activa
                return self.driver
            except WebDriverException:
                self.driver = None  # el usuario cerró la ventana o la sesión murió
        print("[*] Iniciando navegador...")
        self.driver = self._crear_driver()
        return self.driver

    def cerrar(self):
        """Cierra el navegador si está abierto."""
        if self.driver is not None:
            try:
                self.driver.quit()
                print("[*] Navegador cerrado.")
            except WebDriverException:
                pass
            finally:
                self.driver = None

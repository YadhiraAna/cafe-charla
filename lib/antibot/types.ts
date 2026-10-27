/** Tipos compartidos cliente/servidor de la telemetría anti-bot. Solo números, textos cortos y booleanos: nunca se envía qué tecla se pulsó. */
export interface Behavior {
  ageMs: number; firstMs: number;                         // tiempo desde que se mostró el formulario / hasta la 1ª interacción
  mouseMoves: number; mousePath: number; speedMean: number; speedCv: number; straightness: number; dirChanges: number;
  clicks: number; clickMean: number; clickCv: number;     // intervalos entre clics (ms) y su coeficiente de variación
  keys: number; keyMean: number; keyCv: number;           // intervalos entre teclas (ms)
  pastes: number; inputs: number; maxCps: number;         // caracteres insertados por segundo (máximo)
  focusSwitches: number; scrolls: number; touches: number;
  entKeys: number; entMouseDir: number; entMouseSpeed: number;                              // entropía de Shannon (bits) de teclado y ratón
  hiddenInteractions: number; unfocusedKeys: number; visChanges: number; hiddenMs: number;  // API de visibilidad de la página
}
export interface Fingerprint {
  webdriver: boolean; plugins: number; languages: number; chrome: boolean;
  outerW: number; outerH: number; screenW: number; screenH: number; touch: boolean; tz: number; ua: string;
}
/** Técnicas avanzadas: objetos globales de automatización, Navigation Timing y huella de canvas/WebGL/fuentes/hardware. */
export interface Entorno {
  globals: string[]; webdriverSobrescrito: boolean;
  nav: { presente: boolean; incoherente: boolean; tipo: string; loadMs: number };
  huella: { hash: string; canvasOk: boolean; canvasRuido: boolean; webgl: string; fuentes: number; cores: number; memoria: number; colores: number; dpr: number };
}
export interface AntibotPayload { formToken: string; website: string; behavior?: Partial<Behavior>; fp?: Fingerprint; entorno?: Entorno }
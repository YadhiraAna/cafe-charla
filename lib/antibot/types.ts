/** Tipos compartidos cliente/servidor de la telemetría anti-bot. Solo números y booleanos: nunca se envía qué tecla se pulsó. */
export interface Behavior {
  ageMs: number; firstMs: number;                         // tiempo desde que se mostró el formulario / hasta la 1ª interacción
  mouseMoves: number; mousePath: number; speedMean: number; speedCv: number; straightness: number; dirChanges: number;
  clicks: number; clickMean: number; clickCv: number;     // intervalos entre clics (ms) y su coeficiente de variación
  keys: number; keyMean: number; keyCv: number;           // intervalos entre teclas (ms)
  pastes: number; inputs: number; maxCps: number;         // caracteres insertados por segundo (máximo)
  focusSwitches: number; scrolls: number; touches: number;
}
export interface Fingerprint {
  webdriver: boolean; plugins: number; languages: number; chrome: boolean;
  outerW: number; outerH: number; screenW: number; screenH: number; touch: boolean; tz: number; ua: string;
}
export interface AntibotPayload { formToken: string; website: string; behavior?: Partial<Behavior>; fp?: Fingerprint }

"use client";
import { useState } from "react";
/** Estados loading/error/éxito de una acción asíncrona. `run` recibe una función que puede devolver un mensaje de éxito. */
export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState("");
  async function run(fn: () => Promise<string | void>) {
    setBusy(true); setError(""); setDone("");
    try { const m = await fn(); if (m) setDone(m); } catch (e: any) { setError(e.message ?? "Ocurrió un error."); } finally { setBusy(false); }
  }
  return { busy, error, done, run, setError };
}

/** Sal que rota cada DOM_ROTATION_MIN minutos: nombra el atributo con el que se marcan los elementos (data-x<sal>="menu-item"). */
import "server-only";
import crypto from "crypto";
import { DOM_ROTATION_MIN } from "@/lib/antibot/config";

export function domSalt(now = Date.now()) {
  const period = Math.floor(now / (DOM_ROTATION_MIN * 60_000));
  return "x" + crypto.createHmac("sha256", process.env.CAPTCHA_SECRET ?? "dev-only").update(`dom:${period}`).digest("hex").slice(0, 8);
}

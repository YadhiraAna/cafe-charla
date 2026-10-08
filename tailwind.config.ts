import type { Config } from "tailwindcss";
// Paleta: espresso (texto/cabecera), avena (fondo), caramelo (acento), espuma (tarjetas), musgo (éxito).
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { espresso: "#2B1B12", avena: "#EFE8DC", caramelo: "#A8641A", espuma: "#FFFCF6", musgo: "#46563A", rojo: "#A32D2D" },
    fontFamily: { display: ["var(--font-display)", "Georgia", "serif"], body: ["var(--font-body)", "system-ui", "sans-serif"] },
  } },
  plugins: [],
} satisfies Config;

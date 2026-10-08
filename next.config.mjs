/** Cabeceras de seguridad básicas (anti-clickjacking, sniffing y fuga de referrer). */
const headers = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
export default { reactStrictMode: true, async headers() { return [{ source: "/(.*)", headers }]; } };

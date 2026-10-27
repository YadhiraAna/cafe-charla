/** Esquemas Zod compartidos. Zod descarta campos desconocidos (role, status, authorId…) → sin "mass assignment". */
import { z } from "zod";

const num = z.number().finite().min(0).max(1e9);
export const fpSchema = z.object({ webdriver: z.boolean(), plugins: num, languages: num, chrome: z.boolean(), outerW: num, outerH: num, screenW: num, screenH: num, touch: z.boolean(), tz: z.number().finite().min(-1000).max(1000), ua: z.string().max(200) });
/** Técnicas avanzadas: objetos globales, Navigation Timing y huella de canvas/WebGL/fuentes/hardware. */
export const entornoSchema = z.object({
  globals: z.array(z.string().max(60)).max(10), webdriverSobrescrito: z.boolean(),
  nav: z.object({ presente: z.boolean(), incoherente: z.boolean(), tipo: z.string().max(20), loadMs: num }),
  huella: z.object({ hash: z.string().max(64), canvasOk: z.boolean(), canvasRuido: z.boolean(), webgl: z.string().max(120), fuentes: num, cores: num, memoria: num, colores: num, dpr: num }),
});
/** Telemetría anti-bot que acompaña a cada formulario con CAPTCHA (solo números; el servidor decide). */
export const antibotSchema = z.object({
  formToken: z.string().max(300), website: z.string().max(100).default(""), fp: fpSchema.optional(), entorno: entornoSchema.optional(),
  behavior: z.object({ ageMs: num, firstMs: num, mouseMoves: num, mousePath: num, speedMean: num, speedCv: num, straightness: num, dirChanges: num, clicks: num, clickMean: num, clickCv: num,
    keys: num, keyMean: num, keyCv: num, pastes: num, inputs: num, maxCps: num, focusSwitches: num, scrolls: num, touches: num,
    entKeys: num, entMouseDir: num, entMouseSpeed: num, hiddenInteractions: num, unfocusedKeys: num, visChanges: num, hiddenMs: num }).partial().optional(),
});
export const captcha = z.object({ captchaToken: z.string().min(10).max(2000), captchaAnswer: z.string().max(50), antibot: antibotSchema.optional() });
export const docId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Identificador inválido.");

const img = {
  imageUrl: z.string().url().max(500).refine(u => u.startsWith("https://res.cloudinary.com/"), "URL de imagen no válida").or(z.literal("")).default(""),
  imagePublicId: z.string().max(200).refine(p => p === "" || p.startsWith("coff/"), "ID de imagen no válido").default(""),
};

export const registerSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(60),
  email: z.string().trim().toLowerCase().email("Correo no válido.").max(120),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72)
    .regex(/[A-Za-z]/, "La contraseña debe incluir una letra.").regex(/\d/, "La contraseña debe incluir un número."),
  confirmPassword: z.string(),
  terms: z.literal(true, { errorMap: () => ({ message: "Debes aceptar los términos y el aviso de privacidad." }) }),
}).merge(captcha).refine(d => d.password === d.confirmPassword, { message: "Las contraseñas no coinciden." });

export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email("Correo no válido."), password: z.string().min(1).max(72) }).merge(captcha);
export const resetSchema = z.object({ email: z.string().trim().toLowerCase().email("Correo no válido.") });

export const profileSchema = z.object({ name: z.string().trim().min(2).max(60), photoURL: img.imageUrl, photoPublicId: img.imagePublicId }).partial();
export const userAdminSchema = z.object({ role: z.enum(["user", "moderator", "admin", "waiter"]).optional(), status: z.enum(["active", "disabled"]).optional() })
  .refine(d => d.role || d.status, { message: "Nada que actualizar." });

export const postBase = z.object({ title: z.string().trim().min(3, "Título muy corto.").max(120), content: z.string().trim().min(10, "Contenido muy corto.").max(5000), ...img });
export const postCreate = postBase.merge(captcha);
export const postUpdate = postBase.partial();

export const commentBase = z.object({ content: z.string().trim().min(1, "Escribe un comentario.").max(1000) });
export const commentCreate = commentBase.extend({ postId: docId }).merge(captcha);

export const reviewBase = z.object({ rating: z.number().int().min(1).max(5), product: z.string().trim().min(2).max(80), content: z.string().trim().min(10, "Reseña muy corta.").max(1000) });
export const reviewCreate = reviewBase.merge(captcha);
export const reviewUpdate = reviewBase.partial();

export const moderationSchema = z.object({ type: z.enum(["post", "comment", "review"]), id: docId, status: z.enum(["published", "pending", "hidden"]) });

export const CATEGORIES = ["Café", "Bebidas", "Té", "Postres", "Alimentos"] as const;
export const menuCreate = z.object({
  name: z.string().trim().min(2).max(80), description: z.string().trim().min(5).max(300),
  category: z.enum(CATEGORIES), size: z.string().trim().min(1).max(30),
  price: z.number().min(0.01).max(9999).transform(n => Math.round(n * 100) / 100),
  available: z.boolean().default(true), ...img,
});
export const menuUpdate = menuCreate.partial();

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD).");
export const promoCreate = z.object({
  title: z.string().trim().min(3).max(100), description: z.string().trim().min(5).max(300),
  discount: z.number().min(0).max(100), startDate: day, endDate: day, active: z.boolean().default(true), ...img,
});
export const promoUpdate = promoCreate.partial();
export const promoCheck = (m: { startDate: string; endDate: string }) => (m.endDate < m.startDate ? "La fecha final debe ser posterior a la inicial." : null);
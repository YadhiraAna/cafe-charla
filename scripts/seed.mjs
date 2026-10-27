/**
 * Datos iniciales (idempotente: usa ids fijos, se puede ejecutar varias veces).
 * Uso:  npm run seed      (requiere .env.local con FIREBASE_ADMIN_* y SEED_PASSWORD; Node 20.6+)
 * Crea 3 cuentas demo en Firebase Auth (usuario, moderador, administrador). La contraseña vive SOLO en
 * Firebase Auth; Firestore guarda únicamente el perfil. Cambia o elimina estas cuentas fuera de pruebas.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const need = k => { if (!process.env[k]) { console.error(`Falta la variable ${k} en .env.local`); process.exit(1); } return process.env[k]; };
initializeApp({ credential: cert({ projectId: need("FIREBASE_ADMIN_PROJECT_ID"), clientEmail: need("FIREBASE_ADMIN_CLIENT_EMAIL"), privateKey: need("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n") }) });
const auth = getAuth(), db = getFirestore();
const password = need("SEED_PASSWORD");
if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { console.error("SEED_PASSWORD debe tener 8+ caracteres, una letra y un número."); process.exit(1); }

const ago = h => Timestamp.fromDate(new Date(Date.now() - h * 3600e3));
const day = offset => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const now = () => FieldValue.serverTimestamp();

// 1) Cuentas demo
const people = [
  { email: "usuario@cafecharla.example", name: "Ana Usuaria", role: "user" },
  { email: "moderador@cafecharla.example", name: "Mateo Moderador", role: "moderator" },
  { email: "admin@cafecharla.example", name: "Alma Administradora", role: "admin" },
  { email: "cajero@cafecharla.example", name: "Marco Cajero", role: "waiter" },
];
const uid = {};
for (const p of people) {
  let u; try { u = await auth.getUserByEmail(p.email); } catch { u = await auth.createUser({ email: p.email, password, displayName: p.name }); }
  uid[p.role] = u.uid;
  await db.doc(`users/${u.uid}`).set({ uid: u.uid, name: p.name, email: p.email, role: p.role, photoURL: "", photoPublicId: "", status: "active", createdAt: now(), updatedAt: now(), lastLoginAt: null }, { merge: true });
}

// 2) Menú (9 productos)
const menu = [
  ["Espresso", "Doble shot de nuestra mezcla de la casa.", "Café", "2 oz", 38], ["Americano", "Espresso alargado con agua caliente.", "Café", "12 oz", 45],
  ["Latte de vainilla", "Espresso, leche vaporizada y jarabe de vainilla.", "Café", "12 oz", 62], ["Capuchino", "Espresso con leche y espuma densa.", "Café", "8 oz", 58],
  ["Chocolate caliente", "Chocolate de metate con leche entera.", "Bebidas", "12 oz", 55], ["Limonada de menta", "Limón recién exprimido y menta fresca.", "Bebidas", "16 oz", 48],
  ["Té chai", "Té negro con especias y leche.", "Té", "12 oz", 52], ["Concha de vainilla", "Pan dulce horneado esta mañana.", "Postres", "Pieza", 28],
  ["Sándwich de pollo", "Pollo asado, aguacate y pan de masa madre.", "Alimentos", "Pieza", 89],
];
for (const [i, [name, description, category, size, price]] of menu.entries())
  await db.doc(`menu/seed-menu-${i + 1}`).set({ name, description, category, size, price, imageUrl: "", imagePublicId: "", available: i !== 7, createdAt: now(), updatedAt: now() });

// 3) Promociones (3)
const promos = [["2x1 en capuchinos", "Los martes, de 3 a 6 pm.", 50, -2, 30], ["Desayuno completo", "Café + pan dulce con descuento por la mañana.", 20, -1, 45], ["Té chai de temporada", "Prueba el chai con 15% de descuento.", 15, -3, 20]];
for (const [i, [title, description, discount, s, e]] of promos.entries())
  await db.doc(`promotions/seed-promo-${i + 1}`).set({ title, description, discount, startDate: day(s), endDate: day(e), active: true, imageUrl: "", imagePublicId: "", createdAt: now(), updatedAt: now() });

// 4) Publicaciones (3) y comentarios (6)
const posts = [["¿Cuál es su método favorito de preparación?", "Yo estoy entre la prensa francesa y el V60. ¿Qué usan en casa y por qué?"],
  ["Recomendación: granos de Chiapas", "Probé el lote de esta semana y tiene notas de chocolate y nuez. Muy recomendable."], ["Reunión de lectura los sábados", "Estoy armando un club de lectura en la mesa larga. ¿Quién se apunta?"]];
for (const [i, [title, content]] of posts.entries())
  await db.doc(`posts/seed-post-${i + 1}`).set({ authorId: uid.user, authorName: "Ana Usuaria", title, content, imageUrl: "", imagePublicId: "", status: "published", createdAt: ago(30 - i * 6), updatedAt: ago(30 - i * 6) });
const comments = [[1, "moderator", "Mateo Moderador", "V60 sin dudarlo, se nota la acidez."], [1, "admin", "Alma Administradora", "En casa usamos prensa francesa, es lo más práctico."],
  [2, "admin", "Alma Administradora", "¡Gracias por la recomendación! Queda poco de ese lote."], [2, "moderator", "Mateo Moderador", "Lo probé ayer, coincido con las notas de chocolate."],
  [3, "user", "Ana Usuaria", "Propongo empezar el sábado próximo a las 11."], [3, "moderator", "Mateo Moderador", "Me apunto. ¿Qué libro leemos primero?"]];
for (const [i, [p, role, authorName, content]] of comments.entries())
  await db.doc(`comments/seed-comment-${i + 1}`).set({ postId: `seed-post-${p}`, authorId: uid[role], authorName, content, status: "published", createdAt: ago(20 - i), updatedAt: ago(20 - i) });

// 5) Reseñas (5): id = authorId (una por usuario). Autores ficticios sin cuenta.
const reviews = [["Lucía", 5, "Latte de vainilla", "El mejor latte del centro, la espuma es perfecta."], ["Diego", 4, "Capuchino", "Muy buen sabor, aunque llegó un poco tibio."], ["Fernanda", 5, "Concha de vainilla", "Recién horneada, suave y nada empalagosa."],
  ["Gael", 3, "Té chai", "Rico, pero me gustaría que tuviera más especias."], ["Sofía", 5, "Espresso", "Intenso y equilibrado. Volveré seguro."]];
for (const [i, [authorName, rating, product, content]] of reviews.entries())
  await db.doc(`reviews/seed_${i + 1}`).set({ authorId: `seed_${i + 1}`, authorName, rating, product, content, status: "published", createdAt: ago(40 - i * 5), updatedAt: ago(40 - i * 5) });

await db.collection("logs").add({ userId: "system:seed", userName: "Seed", userRole: "system", action: "CREATE", module: "users", targetType: "seed", targetId: "", status: "success", description: "Datos iniciales cargados", timestamp: now() });
console.log("Listo. Cuentas demo (misma contraseña SEED_PASSWORD):\n  usuario@cafecharla.example\n  moderador@cafecharla.example\n  admin@cafecharla.example");

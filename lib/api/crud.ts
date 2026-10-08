/**
 * Fábricas de handlers CRUD.
 *  - ownedItem: contenido de la comunidad (posts/comments/reviews). Editar → solo el autor.
 *    Eliminar → autor, moderador o admin.
 *  - adminCollection: menú y promociones. Todo → solo admin.
 * Cada operación deja un log de auditoría.
 */
import "server-only";
import { NextRequest } from "next/server";
import { ZodTypeAny } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, errorResponse, HttpError } from "@/lib/auth/server";
import { writeLog, LogInput } from "@/lib/logs/logger";
import { deleteImage } from "@/lib/cloudinary/server";
import { parse, ok, ALL, MOD } from "@/lib/api/http";

type Ctx = { params: { id: string } };
type Mod = LogInput["module"];

async function load(col: string, id: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new HttpError(404, "No encontrado.");
  const snap = await adminDb.collection(col).doc(id).get();
  if (!snap.exists) throw new HttpError(404, "No encontrado.");
  return { ref: snap.ref, data: snap.data()! };
}
/** Si cambia la imagen, borra la anterior de Cloudinary. */
const swapImage = (old: any, n: any) => (n.imagePublicId !== undefined && n.imagePublicId !== old.imagePublicId ? deleteImage(old.imagePublicId) : Promise.resolve());

export function ownedItem(c: { col: string; module: Mod; type: string; update: ZodTypeAny; cascade?: (id: string) => Promise<void> }) {
  return {
    PATCH: async (req: NextRequest, { params }: Ctx) => {
      try {
        const s = await requireRole(req, ALL);
        const { ref, data } = await load(c.col, params.id);
        if (data.authorId !== s.uid) throw new HttpError(403, "Solo puedes editar tu propio contenido.");
        if (!["published", "pending"].includes(data.status)) throw new HttpError(403, "Este contenido no se puede editar.");
        const body = await parse(req, c.update);
        await swapImage(data, body);
        await ref.update({ ...body, updatedAt: FieldValue.serverTimestamp() });
        await writeLog({ session: s, action: "UPDATE", module: c.module, targetType: c.type, targetId: ref.id, status: "success", description: `Editó ${c.type}` });
        return ok();
      } catch (e) { return errorResponse(e); }
    },
    DELETE: async (req: NextRequest, { params }: Ctx) => {
      try {
        const s = await requireRole(req, ALL);
        const { ref, data } = await load(c.col, params.id);
        const own = data.authorId === s.uid;
        if (!own && !MOD.includes(s.role)) throw new HttpError(403, "No puedes eliminar contenido de otros usuarios.");
        await c.cascade?.(ref.id);
        await deleteImage(data.imagePublicId);
        await ref.delete();
        await writeLog({ session: s, action: "DELETE", module: own ? c.module : "moderation", targetType: c.type, targetId: ref.id, status: "success", description: own ? `Eliminó su ${c.type}` : `Eliminó ${c.type} de otro usuario` });
        return ok();
      } catch (e) { return errorResponse(e); }
    },
  };
}

export function adminCollection(c: { col: string; module: Mod; type: string; create: ZodTypeAny; update: ZodTypeAny; toggleKey: string; check?: (m: any) => string | null }) {
  return {
    POST: async (req: NextRequest) => {
      try {
        const s = await requireRole(req, ["admin"]);
        const body = await parse(req, c.create);
        const err = c.check?.(body); if (err) throw new HttpError(400, err);
        const ref = await adminDb.collection(c.col).add({ ...body, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        await writeLog({ session: s, action: "CREATE", module: c.module, targetType: c.type, targetId: ref.id, status: "success", description: `Creó ${c.type}` });
        return ok({ id: ref.id });
      } catch (e) { return errorResponse(e); }
    },
    PATCH: async (req: NextRequest, { params }: Ctx) => {
      try {
        const s = await requireRole(req, ["admin"]);
        const { ref, data } = await load(c.col, params.id);
        const body = await parse(req, c.update);
        const err = c.check?.({ ...data, ...body }); if (err) throw new HttpError(400, err);
        await swapImage(data, body);
        await ref.update({ ...body, updatedAt: FieldValue.serverTimestamp() });
        const toggle = Object.keys(body).length === 1 && c.toggleKey in body;
        await writeLog({ session: s, action: toggle ? "TOGGLE" : "UPDATE", module: c.module, targetType: c.type, targetId: ref.id, status: "success", description: toggle ? `${c.toggleKey}=${body[c.toggleKey]} en ${c.type}` : `Editó ${c.type}` });
        return ok();
      } catch (e) { return errorResponse(e); }
    },
    DELETE: async (req: NextRequest, { params }: Ctx) => {
      try {
        const s = await requireRole(req, ["admin"]);
        const { ref, data } = await load(c.col, params.id);
        await deleteImage(data.imagePublicId);
        await ref.delete();
        await writeLog({ session: s, action: "DELETE", module: c.module, targetType: c.type, targetId: ref.id, status: "success", description: `Eliminó ${c.type}` });
        return ok();
      } catch (e) { return errorResponse(e); }
    },
  };
}

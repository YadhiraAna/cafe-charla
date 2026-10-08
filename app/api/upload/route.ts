/** POST /api/upload (multipart: file, purpose). Requiere sesión. menu/promo → solo admin. */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, errorResponse, HttpError, Role } from "@/lib/auth/server";
import { uploadImage, detectImageType, MAX_IMAGE_BYTES, ALLOWED_MIME } from "@/lib/cloudinary/server";
import { writeLog } from "@/lib/logs/logger";

const PURPOSES: Record<string, Role[]> = {
  profile: ["user", "moderator", "admin"], post: ["user", "moderator", "admin"],
  menu: ["admin"], promo: ["admin"],
};

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const purpose = String(form.get("purpose") ?? "");
    if (!PURPOSES[purpose]) throw new HttpError(400, "Propósito de imagen inválido.");
    const session = await requireRole(req, PURPOSES[purpose]);

    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Falta el archivo.");
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new HttpError(400, "La imagen debe pesar máximo 2 MB.");
    if (!ALLOWED_MIME.includes(file.type)) throw new HttpError(400, "Solo se permiten JPG, PNG o WEBP.");

    const buf = Buffer.from(await file.arrayBuffer());
    const real = detectImageType(buf);
    if (!real || real !== file.type) throw new HttpError(400, "El contenido no coincide con un formato de imagen válido.");

    const result = await uploadImage(buf, purpose);
    await writeLog({ session, action: "UPLOAD", module: "images", targetType: purpose, targetId: result.publicId, status: "success", description: `Imagen subida (${purpose})` });
    return NextResponse.json(result);
  } catch (e) { return errorResponse(e); }
}

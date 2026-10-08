/** Cloudinary (plan gratuito). El API secret solo existe aquí, en el servidor. */
import "server-only";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

/** Comprueba la FIRMA real del archivo (magic bytes), no solo extensión ni MIME declarado. SVG se rechaza. */
export function detectImageType(b: Buffer): string | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

export function uploadImage(buf: Buffer, folder: string): Promise<{ imageUrl: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: `coff/${folder}`, resource_type: "image", allowed_formats: ["jpg", "jpeg", "png", "webp"] },
      (err, r) => (err || !r ? reject(err) : resolve({ imageUrl: r.secure_url, publicId: r.public_id }))).end(buf);
  });
}

/** Elimina la imagen al borrar publicación/producto/promoción. No lanza si falla. */
export async function deleteImage(publicId?: string) {
  if (!publicId) return;
  try { await cloudinary.uploader.destroy(publicId); } catch (e) { console.error("[cloudinary] destroy", e); }
}

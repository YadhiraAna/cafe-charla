import { z } from "zod";
import { captcha, docId } from "@/lib/validations/schemas";
import { MAX_CANTIDAD, MAX_PERSONAS } from "@/lib/tickets/reglas";

/** Cajero: crear ticket. `consumidoEn` solo se usa en modo manual y debe ser ISO UTC (el navegador lo convierte). Cada producto lleva su cantidad. */
export const ticketCreate = z.object({
  modoFecha: z.enum(["auto", "manual"]),
  consumidoEn: z.string().datetime({ message: "Fecha y hora con formato inválido." }).optional(),
  productos: z.array(z.object({
    id: docId,
    cantidad: z.number().int("La cantidad debe ser un número entero.").min(1, "Cantidad mínima: 1.").max(MAX_CANTIDAD, `Cantidad máxima por producto: ${MAX_CANTIDAD}.`),
  })).min(1, "Selecciona al menos un producto.").max(30),
  personas: z.number().int("Las personas deben ser un número entero.").min(1, "Mínimo 1 persona.").max(MAX_PERSONAS, `Máximo ${MAX_PERSONAS} personas.`),
  correoCliente: z.string().trim().toLowerCase().email("Correo del cliente no válido.").max(120).optional().or(z.literal("")),
});
export const canjeSchema = z.object({ codigo: z.string().trim().min(4, "Escribe el código del ticket.").max(20) }).merge(captcha);
const resena = { rating: z.number().int().min(1).max(5), content: z.string().trim().min(10, "Reseña muy corta.").max(1000) };
export const resenaCrear = z.object({ productId: docId, ...resena }).merge(captcha);
export const resenaActualizar = z.object(resena).merge(captcha);
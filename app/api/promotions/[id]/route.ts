import { adminCollection } from "@/lib/api/crud";
import { promoCreate, promoUpdate, promoCheck } from "@/lib/validations/schemas";
const h = adminCollection({ col: "promotions", module: "promotions", type: "promotion", create: promoCreate, update: promoUpdate, toggleKey: "active", check: promoCheck });
export const PATCH = h.PATCH; export const DELETE = h.DELETE;

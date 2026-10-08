import { adminCollection } from "@/lib/api/crud";
import { promoCreate, promoUpdate, promoCheck } from "@/lib/validations/schemas";
export const POST = adminCollection({ col: "promotions", module: "promotions", type: "promotion", create: promoCreate, update: promoUpdate, toggleKey: "active", check: promoCheck }).POST;

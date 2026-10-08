import { adminCollection } from "@/lib/api/crud";
import { menuCreate, menuUpdate } from "@/lib/validations/schemas";
const h = adminCollection({ col: "menu", module: "menu", type: "menu", create: menuCreate, update: menuUpdate, toggleKey: "available" });
export const PATCH = h.PATCH; export const DELETE = h.DELETE;

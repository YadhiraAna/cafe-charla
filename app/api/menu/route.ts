import { adminCollection } from "@/lib/api/crud";
import { menuCreate, menuUpdate } from "@/lib/validations/schemas";
export const POST = adminCollection({ col: "menu", module: "menu", type: "menu", create: menuCreate, update: menuUpdate, toggleKey: "available" }).POST;

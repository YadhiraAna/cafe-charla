import { ownedItem } from "@/lib/api/crud";
import { commentBase } from "@/lib/validations/schemas";
const h = ownedItem({ col: "comments", module: "forum", type: "comment", update: commentBase });
export const PATCH = h.PATCH; export const DELETE = h.DELETE;

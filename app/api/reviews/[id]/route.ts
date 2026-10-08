import { ownedItem } from "@/lib/api/crud";
import { reviewUpdate } from "@/lib/validations/schemas";
const h = ownedItem({ col: "reviews", module: "reviews", type: "review", update: reviewUpdate });
export const PATCH = h.PATCH; export const DELETE = h.DELETE;

/** PATCH/DELETE /api/posts/:id. Al borrar una publicación se borran sus comentarios e imagen. */
import { adminDb } from "@/lib/firebase/admin";
import { ownedItem } from "@/lib/api/crud";
import { postUpdate } from "@/lib/validations/schemas";

const h = ownedItem({
  col: "posts", module: "forum", type: "post", update: postUpdate,
  cascade: async (id) => {
    const snap = await adminDb.collection("comments").where("postId", "==", id).limit(500).get();
    const batch = adminDb.batch(); snap.docs.forEach(d => batch.delete(d.ref)); await batch.commit();
  },
});
export const PATCH = h.PATCH; export const DELETE = h.DELETE;

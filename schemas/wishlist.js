import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

export const wishlistItemSchema = z.object({
  productId: objectId,
});

export const wishlistMergeSchema = z.object({
  productIds: z
    .array(objectId)
    .max(200, "Too many wishlist items to merge."),
});

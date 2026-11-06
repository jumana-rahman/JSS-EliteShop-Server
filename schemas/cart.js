import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const quantity = z.coerce
  .number({ error: "Quantity is required." })
  .int("Quantity must be a whole number.")
  .min(1, "Quantity must be at least 1.")
  .max(99, "Quantity cannot exceed 99.");

export const cartItemAddSchema = z.object({
  productId: objectId,
  quantity: quantity.default(1),
});

export const cartItemUpdateSchema = z.object({
  quantity: z.coerce
    .number({ error: "Quantity is required." })
    .int("Quantity must be a whole number.")
    .min(0, "Quantity cannot be negative.")
    .max(99, "Quantity cannot exceed 99."),
});

export const cartMergeSchema = z.object({
  items: z
    .array(
      z.object({
        productId: objectId,
        quantity,
      })
    )
    .max(100, "Too many cart items to merge."),
});

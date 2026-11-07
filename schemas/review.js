import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

export const reviewCreateSchema = z.object({
  productId: objectId,
  rating: z.coerce
    .number({ error: "Choose a rating." })
    .int("Rating must be a whole number.")
    .min(1, "Rating must be at least 1 star.")
    .max(5, "Rating cannot be more than 5 stars."),
  title: z
    .string()
    .trim()
    .max(120, "Title is too long.")
    .optional()
    .default(""),
  text: z
    .string({ error: "Review text is required." })
    .trim()
    .min(10, "Review must be at least 10 characters.")
    .max(1000, "Review must be 1000 characters or fewer."),
});

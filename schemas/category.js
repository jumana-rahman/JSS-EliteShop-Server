import { z } from "zod";

const categoryFields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Use a hex color like #831843"),
  description: z.string().trim().max(500),
};

export const categoryCreateSchema = z.object({
  ...categoryFields,
  color: categoryFields.color.optional().default("#831843"),
  description: categoryFields.description.optional().default(""),
});

export const categoryUpdateSchema = z.object({
  name: categoryFields.name.optional(),
  color: categoryFields.color.optional(),
  description: categoryFields.description.optional(),
});

export const subcategoryCreateSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
});

export const subcategoryUpdateSchema = subcategoryCreateSchema.partial();

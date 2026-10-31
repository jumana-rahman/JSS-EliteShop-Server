import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const productFields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(200),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(5000),
  brand: z.string().trim().max(80),
  categoryId: objectId,
  subcategoryId: objectId.nullable(),
  price: z.coerce.number().min(0).max(10000000),
  originalPrice: z.coerce.number().min(0).max(10000000),
  stock: z.coerce.number().int().min(0).max(1000000),
  images: z.array(z.string().trim().min(1)).max(8),
  specs: z.record(z.string(), z.string()),
  tags: z.array(z.string().trim().min(1)).max(20),
  isFeatured: z.boolean(),
  isTrending: z.boolean(),
  isNew: z.boolean(),
};

export const productCreateSchema = z.object({
  ...productFields,
  brand: productFields.brand.optional().default(""),
  subcategoryId: productFields.subcategoryId.optional().default(null),
  originalPrice: productFields.originalPrice.optional(),
  images: productFields.images.optional().default([]),
  specs: productFields.specs.optional().default({}),
  tags: productFields.tags.optional().default([]),
  isFeatured: productFields.isFeatured.optional().default(false),
  isTrending: productFields.isTrending.optional().default(false),
  isNew: productFields.isNew.optional().default(false),
});

export const productUpdateSchema = z.object({
  name: productFields.name.optional(),
  description: productFields.description.optional(),
  brand: productFields.brand.optional(),
  categoryId: productFields.categoryId.optional(),
  subcategoryId: productFields.subcategoryId.optional(),
  price: productFields.price.optional(),
  originalPrice: productFields.originalPrice.optional(),
  stock: productFields.stock.optional(),
  images: productFields.images.optional(),
  specs: productFields.specs.optional(),
  tags: productFields.tags.optional(),
  isFeatured: productFields.isFeatured.optional(),
  isTrending: productFields.isTrending.optional(),
  isNew: productFields.isNew.optional(),
});

export const bulkStockSchema = z.object({
  items: z
    .array(
      z.object({
        id: objectId,
        stock: z.coerce.number().int().min(0).max(1000000),
      })
    )
    .min(1, "Add at least one stock update")
    .max(200),
});

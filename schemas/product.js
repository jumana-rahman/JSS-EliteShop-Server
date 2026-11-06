import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const productFields = {
  name: z
    .string({ error: "Product name is required." })
    .trim()
    .min(2, "Product name must be at least 2 characters.")
    .max(200, "Product name must be 200 characters or fewer."),
  description: z
    .string({ error: "Description is required." })
    .trim()
    .min(1, "Description is required."),
  brand: z.string().trim().max(80),
  categoryId: z
    .string({ error: "Category is required." })
    .min(1, "Category is required.")
    .regex(/^[a-f0-9]{24}$/i, "Invalid category."),
  subcategoryId: z
    .string({ error: "Subcategory is required." })
    .min(1, "Subcategory is required.")
    .regex(/^[a-f0-9]{24}$/i, "Invalid subcategory."),
  price: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce
      .number({ error: "Selling price is required." })
      .min(0, "Selling price cannot be negative.")
      .max(10000000, "Selling price is too high.")
  ),
  originalPrice: z.coerce.number().min(0).max(10000000),
  stock: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce
      .number({ error: "Stock is required." })
      .int("Stock must be a whole number.")
      .min(0, "Stock cannot be negative.")
      .max(1000000, "Stock is too high.")
  ),
  images: z
    .array(z.string().trim().min(1, "Image URL cannot be empty."), {
      error: "At least one image is required.",
    })
    .min(1, "At least one image is required.")
    .max(8, "You can add up to 8 images."),
  specs: z.record(z.string(), z.string()),
  tags: z.array(z.string().trim().min(1)).max(20),
  isFeatured: z.boolean(),
  isTrending: z.boolean(),
  isNew: z.boolean(),
};

export const productCreateSchema = z.object({
  ...productFields,
  brand: productFields.brand.optional().default(""),
  originalPrice: productFields.originalPrice.optional(),
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

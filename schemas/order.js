import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const addressInput = z.object({
  name: z
    .string({ error: "Full name is required." })
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(80, "Full name is too long."),
  phone: z
    .string({ error: "Phone number is required." })
    .trim()
    .min(6, "Enter a valid phone number.")
    .max(30, "Phone number is too long."),
  addressLine: z
    .string({ error: "Street address is required." })
    .trim()
    .min(5, "Street address is too short.")
    .max(200, "Street address is too long."),
  city: z
    .string({ error: "City is required." })
    .trim()
    .min(2, "City must be at least 2 characters.")
    .max(80, "City is too long."),
  postalCode: z
    .string({ error: "Postal code is required." })
    .trim()
    .min(3, "Enter a valid postal code.")
    .max(20, "Postal code is too long."),
});

export const orderCreateSchema = z
  .object({
    addressId: objectId.optional(),
    address: addressInput.optional(),
    saveAddress: z.boolean().optional().default(false),
    notes: z.string().trim().max(500, "Notes are too long.").optional().default(""),
  })
  .refine((data) => data.addressId || data.address, {
    message: "A delivery address is required.",
    path: ["address"],
  });

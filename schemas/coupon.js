import { z } from "zod";
import { DISCOUNT_TYPES } from "../models/coupon.js";

const couponCode = z
  .string({ error: "Coupon code is required." })
  .trim()
  .toUpperCase()
  .min(3, "Coupon code must be at least 3 characters.")
  .max(40, "Coupon code is too long.")
  .regex(
    /^[A-Z0-9_-]+$/,
    "Use letters, numbers, hyphens or underscores only."
  );

const couponFields = {
  code: couponCode,
  description: z
    .string()
    .trim()
    .max(160, "Description is too long.")
    .optional()
    .default(""),
  discountType: z.enum(DISCOUNT_TYPES, {
    error: "Choose a discount type.",
  }),
  discountValue: z.coerce
    .number({ error: "Discount value is required." })
    .positive("Discount value must be greater than zero.")
    .max(100000, "Discount value is too large."),
  minOrder: z.coerce
    .number()
    .min(0, "Minimum order cannot be negative.")
    .max(1000000, "Minimum order is too large.")
    .optional()
    .default(0),
  maxUses: z.coerce
    .number()
    .int("Maximum uses must be a whole number.")
    .min(0, "Maximum uses cannot be negative.")
    .max(1000000, "Maximum uses is too large.")
    .optional()
    .default(0),
  expiresAt: z
    .string()
    .trim()
    .max(40, "Expiry date is too long.")
    .optional()
    .default(""),
  isActive: z.boolean().optional().default(true),
};

function validateCouponValues(data, ctx) {
  if (data.discountType === "percentage" && data.discountValue > 100) {
    ctx.addIssue({
      code: "custom",
      path: ["discountValue"],
      message: "Percentage discounts cannot exceed 100.",
    });
  }

  if (data.expiresAt) {
    const date = new Date(data.expiresAt);

    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Enter a valid expiry date.",
      });
    }
  }
}

export const couponCreateSchema = z
  .object(couponFields)
  .superRefine(validateCouponValues);

export const couponUpdateSchema = z
  .object({
    code: couponCode.optional(),
    description: z.string().trim().max(160, "Description is too long.").optional(),
    discountType: z.enum(DISCOUNT_TYPES).optional(),
    discountValue: z.coerce
      .number()
      .positive("Discount value must be greater than zero.")
      .max(100000, "Discount value is too large.")
      .optional(),
    minOrder: z.coerce
      .number()
      .min(0, "Minimum order cannot be negative.")
      .optional(),
    maxUses: z.coerce
      .number()
      .int("Maximum uses must be a whole number.")
      .min(0, "Maximum uses cannot be negative.")
      .optional(),
    expiresAt: z.string().trim().max(40, "Expiry date is too long.").optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Choose at least one field to update.",
  })
  .superRefine((data, ctx) => {
    if (
      data.discountType === "percentage" &&
      Number(data.discountValue) > 100
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Percentage discounts cannot exceed 100.",
      });
    }

    if (data.expiresAt) {
      const date = new Date(data.expiresAt);

      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({
          code: "custom",
          path: ["expiresAt"],
          message: "Enter a valid expiry date.",
        });
      }
    }
  });

export const couponValidateSchema = z.object({
  code: z
    .string({ error: "Enter a coupon code." })
    .trim()
    .min(1, "Enter a coupon code.")
    .max(40, "Coupon code is too long."),
});

import { z } from "zod";

export const CONTACT_SUBJECTS = [
  "General Inquiry",
  "Order Issue",
  "Return & Refund",
  "Payment Problem",
  "Product Question",
  "Other",
];

export const contactCreateSchema = z.object({
  name: z
    .string({ error: "Full name is required." })
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(80, "Full name is too long."),
  email: z
    .string({ error: "Email address is required." })
    .trim()
    .toLowerCase()
    .email("Enter a valid email address.")
    .max(160, "Email address is too long."),
  phone: z
    .string()
    .trim()
    .max(30, "Phone number is too long.")
    .optional()
    .default(""),
  subject: z
    .string({ error: "Please choose a subject." })
    .trim()
    .refine((value) => CONTACT_SUBJECTS.includes(value), {
      message: "Please choose a valid subject.",
    }),
  message: z
    .string({ error: "Message is required." })
    .trim()
    .min(20, "Message must be at least 20 characters.")
    .max(2000, "Message must be 2000 characters or fewer."),
});

export const contactUpdateSchema = z.object({
  isRead: z.boolean({ error: "Choose read status." }),
});

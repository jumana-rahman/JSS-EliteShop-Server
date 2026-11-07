import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { contactCreateSchema } from "../schemas/contact.js";
import * as contactModel from "../models/contact.js";

const router = Router();

router.post(
  "/",
  validate(contactCreateSchema),
  asyncHandler(async (req, res) => {
    const contactMessage = await contactModel.createContactMessage(req.body);
    res.status(201).json({
      contactMessage,
      message: "Your message has been sent! We'll reply within 24 hours.",
    });
  })
);

export default router;

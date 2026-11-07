import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { validate } from "../middleware/validate.js";
import { contactUpdateSchema } from "../schemas/contact.js";
import * as contactModel from "../models/contact.js";

const router = Router();

router.use(requireAdmin);

function numberParam(value) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringParam(value) {
  return typeof value === "string" ? value : "";
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await contactModel.listContactMessages({
      status: stringParam(req.query.status),
      search: stringParam(req.query.search),
      page: numberParam(req.query.page),
      limit: numberParam(req.query.limit),
    });
    res.json(result);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const contactMessage = await contactModel.getContactMessage(req.params.id);
    res.json({ contactMessage });
  })
);

router.patch(
  "/:id",
  validate(contactUpdateSchema),
  asyncHandler(async (req, res) => {
    const contactMessage = await contactModel.markContactMessage(
      req.params.id,
      req.body.isRead
    );
    res.json({ contactMessage, message: "Message updated." });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await contactModel.deleteContactMessage(req.params.id);
    res.json(result);
  })
);

export default router;

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import * as reviewModel from "../models/review.js";

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
    const result = await reviewModel.listAdminReviews({
      productId: stringParam(req.query.productId),
      rating: numberParam(req.query.rating),
      page: numberParam(req.query.page),
      limit: numberParam(req.query.limit),
    });
    res.json(result);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await reviewModel.deleteReviewAsAdmin(req.params.id);
    res.json(result);
  })
);

export default router;

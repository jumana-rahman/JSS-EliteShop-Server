import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { reviewCreateSchema } from "../schemas/review.js";
import * as reviewModel from "../models/review.js";
import { ApiError } from "../utils/ApiError.js";

const router = Router();

function numberParam(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

router.get(
  "/featured",
  asyncHandler(async (req, res) => {
    const reviews = await reviewModel.listFeaturedReviews(
      numberParam(req.query.limit, 6)
    );
    res.json({ reviews });
  })
);

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const reviews = await reviewModel.listUserReviews(req.user.id);
    res.json({ reviews });
  })
);

router.get(
  "/eligibility",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.query.productId) {
      throw new ApiError(422, "A product id is required.");
    }

    const eligibility = await reviewModel.getReviewEligibility(
      req.user.id,
      req.query.productId
    );
    res.json({ eligibility });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.query.productId) {
      throw new ApiError(422, "A product id is required.");
    }

    const result = await reviewModel.listProductReviews(req.query.productId, {
      page: numberParam(req.query.page, 1),
      limit: numberParam(req.query.limit, 6),
    });
    res.json(result);
  })
);

router.post(
  "/",
  requireAuth,
  validate(reviewCreateSchema),
  asyncHandler(async (req, res) => {
    const result = await reviewModel.createReview(req.user.id, req.body);
    res.status(201).json({ ...result, message: "Review posted." });
  })
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await reviewModel.deleteOwnReview(req.user.id, req.params.id);
    res.json(result);
  })
);

export default router;

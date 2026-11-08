import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { validate } from "../middleware/validate.js";
import {
  couponCreateSchema,
  couponUpdateSchema,
} from "../schemas/coupon.js";
import * as couponModel from "../models/coupon.js";

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
    const result = await couponModel.listCoupons({
      search: stringParam(req.query.search),
      status: stringParam(req.query.status),
      page: numberParam(req.query.page),
      limit: numberParam(req.query.limit),
    });
    res.json(result);
  })
);

router.post(
  "/",
  validate(couponCreateSchema),
  asyncHandler(async (req, res) => {
    const coupon = await couponModel.createCoupon(req.body);
    res.status(201).json({ coupon, message: "Coupon created." });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const coupon = await couponModel.getCoupon(req.params.id);
    res.json({ coupon });
  })
);

router.patch(
  "/:id",
  validate(couponUpdateSchema),
  asyncHandler(async (req, res) => {
    const coupon = await couponModel.updateCoupon(req.params.id, req.body);
    res.json({ coupon, message: "Coupon updated." });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await couponModel.deleteCoupon(req.params.id);
    res.json(result);
  })
);

export default router;

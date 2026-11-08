import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import { couponValidateSchema } from "../schemas/coupon.js";
import { computePricing, roundMoney } from "../lib/pricing.js";
import * as couponModel from "../models/coupon.js";
import * as cartModel from "../models/cart.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/validate",
  validate(couponValidateSchema),
  asyncHandler(async (req, res) => {
    const cart = await cartModel.getCart(req.user.id);

    if (!cart.items.length) {
      throw new ApiError(422, "Your cart is empty.");
    }

    const subtotal = roundMoney(
      cart.items.reduce(
        (sum, item) => sum + Number(item.product.price) * item.quantity,
        0
      )
    );

    const { coupon } = await couponModel.describeCouponForCart(
      req.user.id,
      req.body.code,
      subtotal
    );

    res.json({
      coupon,
      pricing: computePricing(subtotal, {
        discount_type: coupon.discountType,
        discount_value: coupon.discountValue,
      }),
      message: "Coupon applied.",
    });
  })
);

export default router;

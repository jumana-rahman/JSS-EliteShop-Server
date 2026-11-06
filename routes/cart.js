import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import {
  cartItemAddSchema,
  cartItemUpdateSchema,
  cartMergeSchema,
} from "../schemas/cart.js";
import * as cartModel from "../models/cart.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const cart = await cartModel.getCart(req.user.id);
    res.json({ cart });
  })
);

router.post(
  "/items",
  validate(cartItemAddSchema),
  asyncHandler(async (req, res) => {
    const cart = await cartModel.addCartItem(
      req.user.id,
      req.body.productId,
      req.body.quantity
    );
    res.json({ cart, message: "Item added to cart." });
  })
);

router.patch(
  "/items/:productId",
  validate(cartItemUpdateSchema),
  asyncHandler(async (req, res) => {
    const cart = await cartModel.updateCartItem(
      req.user.id,
      req.params.productId,
      req.body.quantity
    );
    res.json({ cart, message: "Cart updated." });
  })
);

router.delete(
  "/items/:productId",
  asyncHandler(async (req, res) => {
    const cart = await cartModel.removeCartItem(
      req.user.id,
      req.params.productId
    );
    res.json({ cart, message: "Item removed from cart." });
  })
);

router.post(
  "/merge",
  validate(cartMergeSchema),
  asyncHandler(async (req, res) => {
    const cart = await cartModel.mergeCart(req.user.id, req.body.items);
    res.json({ cart, message: "Cart merged." });
  })
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    const cart = await cartModel.clearCart(req.user.id);
    res.json({ cart, message: "Cart cleared." });
  })
);

export default router;

import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import {
  wishlistItemSchema,
  wishlistMergeSchema,
} from "../schemas/wishlist.js";
import * as wishlistModel from "../models/wishlist.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const wishlist = await wishlistModel.getWishlist(req.user.id);
    res.json({ wishlist });
  })
);

router.post(
  "/items",
  validate(wishlistItemSchema),
  asyncHandler(async (req, res) => {
    const wishlist = await wishlistModel.addWishlistItem(
      req.user.id,
      req.body.productId
    );
    res.json({ wishlist, message: "Item added to wishlist." });
  })
);

router.delete(
  "/items/:productId",
  asyncHandler(async (req, res) => {
    const wishlist = await wishlistModel.removeWishlistItem(
      req.user.id,
      req.params.productId
    );
    res.json({ wishlist, message: "Item removed from wishlist." });
  })
);

router.post(
  "/merge",
  validate(wishlistMergeSchema),
  asyncHandler(async (req, res) => {
    const wishlist = await wishlistModel.mergeWishlist(
      req.user.id,
      req.body.productIds
    );
    res.json({ wishlist, message: "Wishlist merged." });
  })
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    const wishlist = await wishlistModel.clearWishlist(req.user.id);
    res.json({ wishlist, message: "Wishlist cleared." });
  })
);

export default router;

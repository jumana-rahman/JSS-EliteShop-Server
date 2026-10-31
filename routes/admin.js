import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { getAdminStats } from "../models/product.js";

const router = Router();

router.get(
  "/stats",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const stats = await getAdminStats();
    res.json({ stats });
  })
);

export default router;

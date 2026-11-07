import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import {
  aiChatSchema,
  aiSearchSchema,
  aiCompleteLookSchema,
} from "../schemas/ai.js";
import * as aiModel from "../models/ai.js";

const router = Router();

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;
const buckets = new Map();

function rateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.start > WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });

    if (buckets.size > 2000) {
      for (const [entryKey, entry] of buckets) {
        if (now - entry.start > WINDOW_MS) buckets.delete(entryKey);
      }
    }

    return next();
  }

  bucket.count += 1;

  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({
      message: "Too many AI requests. Please wait a minute and try again.",
    });
  }

  next();
}

router.use(rateLimit);

router.post(
  "/chat",
  validate(aiChatSchema),
  asyncHandler(async (req, res) => {
    const result = await aiModel.chatWithAssistant(req.body);
    res.json(result);
  })
);

router.post(
  "/search",
  validate(aiSearchSchema),
  asyncHandler(async (req, res) => {
    const result = await aiModel.searchProducts(req.body.query);
    res.json(result);
  })
);

router.post(
  "/complete-look",
  validate(aiCompleteLookSchema),
  asyncHandler(async (req, res) => {
    const result = await aiModel.completeLook(req.body.productId);
    res.json(result);
  })
);

export default router;

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";

const router = Router();

const uploadSchema = z.object({
  image: z.string().min(20, "An image is required."),
});

async function uploadToImgBB(image) {
  if (!process.env.IMGBB_API_KEY) {
    throw new ApiError(500, "Image uploads are not configured.");
  }

  if (image.startsWith("data:") && !image.startsWith("data:image/")) {
    throw new ApiError(422, "Only image files can be uploaded.");
  }

  const base64 = (image.includes(",") ? image.split(",")[1] : image).replace(
    /\s/g,
    ""
  );

  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
    throw new ApiError(422, "Invalid image data.");
  }

  const estimatedBytes = Math.ceil((base64.length * 3) / 4);

  if (estimatedBytes > 5 * 1024 * 1024) {
    throw new ApiError(413, "Image must be 5MB or smaller.");
  }

  const form = new URLSearchParams();
  form.set("image", base64);

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
    {
      method: "POST",
      body: form,
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new ApiError(
      502,
      data?.error?.message || "Image upload failed. Please try again."
    );
  }

  return {
    url: data.data.display_url || data.data.url,
    thumb: data.data.thumb?.url || data.data.url,
  };
}

router.post(
  "/",
  requireAdmin,
  validate(uploadSchema),
  asyncHandler(async (req, res) => {
    const result = await uploadToImgBB(req.body.image);

    res.status(201).json({
      ...result,
      message: "Image uploaded.",
    });
  })
);

router.post(
  "/avatar",
  requireAuth,
  validate(uploadSchema),
  asyncHandler(async (req, res) => {
    const result = await uploadToImgBB(req.body.image);

    res.status(201).json({
      ...result,
      message: "Profile photo uploaded.",
    });
  })
);

export default router;

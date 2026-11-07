import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { validate } from "../middleware/validate.js";
import { userStatusSchema } from "../schemas/adminUser.js";
import * as userModel from "../models/user.js";

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
    const result = await userModel.listUsers({
      search: stringParam(req.query.search),
      status: stringParam(req.query.status),
      page: numberParam(req.query.page),
      limit: numberParam(req.query.limit),
    });
    res.json(result);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await userModel.getUser(req.params.id);
    res.json(result);
  })
);

router.patch(
  "/:id",
  validate(userStatusSchema),
  asyncHandler(async (req, res) => {
    const result = await userModel.setUserActive(
      req.params.id,
      req.body.isActive,
      req.user.id
    );
    res.json(result);
  })
);

export default router;

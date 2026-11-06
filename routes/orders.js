import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { orderCreateSchema } from "../schemas/order.js";
import * as orderModel from "../models/order.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const orders = await orderModel.listOrders(req.user.id);
    res.json({ orders });
  })
);

router.post(
  "/",
  validate(orderCreateSchema),
  asyncHandler(async (req, res) => {
    const order = await orderModel.createOrder(req.user.id, req.body);
    res.status(201).json({ order, message: "Order placed." });
  })
);

router.get(
  "/:idOrNumber",
  asyncHandler(async (req, res) => {
    const order = await orderModel.getOrder(req.user.id, req.params.idOrNumber);
    res.json({ order });
  })
);

export default router;

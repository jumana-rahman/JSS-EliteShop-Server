import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { validate } from "../middleware/validate.js";
import { orderUpdateSchema } from "../schemas/order.js";
import * as orderModel from "../models/order.js";

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

function dateParam(value, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await orderModel.listAdminOrders({
      status: stringParam(req.query.status),
      paymentStatus: stringParam(req.query.paymentStatus),
      deliveryStatus: stringParam(req.query.deliveryStatus),
      search: stringParam(req.query.search),
      userId: stringParam(req.query.userId),
      dateFrom: dateParam(req.query.dateFrom),
      dateTo: dateParam(req.query.dateTo, true),
      page: numberParam(req.query.page),
      limit: numberParam(req.query.limit),
    });

    res.json(result);
  })
);

router.get(
  "/:idOrNumber",
  asyncHandler(async (req, res) => {
    const order = await orderModel.getAdminOrder(req.params.idOrNumber);
    res.json({ order });
  })
);

router.patch(
  "/:idOrNumber",
  validate(orderUpdateSchema),
  asyncHandler(async (req, res) => {
    const order = await orderModel.updateAdminOrder(
      req.params.idOrNumber,
      req.body,
      req.user.id
    );
    res.json({ order, message: "Order updated." });
  })
);

export default router;

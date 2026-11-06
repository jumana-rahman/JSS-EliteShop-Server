import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import {
  addressCreateSchema,
  addressUpdateSchema,
} from "../schemas/address.js";
import * as addressModel from "../models/address.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const addresses = await addressModel.listAddresses(req.user.id);
    res.json({ addresses });
  })
);

router.post(
  "/",
  validate(addressCreateSchema),
  asyncHandler(async (req, res) => {
    const address = await addressModel.createAddress(req.user.id, req.body);
    res.status(201).json({ address, message: "Address saved." });
  })
);

router.patch(
  "/:id",
  validate(addressUpdateSchema),
  asyncHandler(async (req, res) => {
    const address = await addressModel.updateAddress(
      req.user.id,
      req.params.id,
      req.body
    );
    res.json({ address, message: "Address updated." });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await addressModel.deleteAddress(req.user.id, req.params.id);
    res.json({ message: "Address deleted." });
  })
);

export default router;

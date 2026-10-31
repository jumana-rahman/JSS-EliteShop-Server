import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { validate } from "../middleware/validate.js";
import {
  productCreateSchema,
  productUpdateSchema,
  bulkStockSchema,
} from "../schemas/product.js";
import * as productModel from "../models/product.js";
import { ApiError } from "../utils/ApiError.js";

const router = Router();

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
    const result = await productModel.listProducts({
      search: stringParam(req.query.search),
      category: stringParam(req.query.category),
      subcategory: stringParam(req.query.subcategory),
      brand: stringParam(req.query.brand),
      minPrice: numberParam(req.query.minPrice),
      maxPrice: numberParam(req.query.maxPrice),
      minRating: numberParam(req.query.rating),
      minDiscount: numberParam(req.query.discount),
      inStock: req.query.inStock === "true",
      stockStatus: stringParam(req.query.stockStatus),
      featured: req.query.featured === "true",
      trending: req.query.trending === "true",
      sort: stringParam(req.query.sort) || "popular",
      page: numberParam(req.query.page),
      limit: numberParam(req.query.limit),
    });

    res.json(result);
  })
);

router.patch(
  "/bulk-stock",
  requireAdmin,
  validate(bulkStockSchema),
  asyncHandler(async (req, res) => {
    const updated = await productModel.bulkUpdateStock(req.body.items);
    res.json({ updated, message: "Stock updated." });
  })
);

router.get(
  "/:idOrSlug/related",
  asyncHandler(async (req, res) => {
    const products = await productModel.findRelatedProducts(
      req.params.idOrSlug,
      numberParam(req.query.limit) || 4
    );
    res.json({ products });
  })
);

router.get(
  "/:idOrSlug",
  asyncHandler(async (req, res) => {
    const product = await productModel.findProduct(req.params.idOrSlug, {
      incrementView: true,
    });

    if (!product) throw new ApiError(404, "Product not found.");

    res.json({ product });
  })
);

router.post(
  "/",
  requireAdmin,
  validate(productCreateSchema),
  asyncHandler(async (req, res) => {
    const product = await productModel.createProduct(req.body);
    res.status(201).json({ product, message: "Product created." });
  })
);

router.patch(
  "/:id",
  requireAdmin,
  validate(productUpdateSchema),
  asyncHandler(async (req, res) => {
    const product = await productModel.updateProduct(req.params.id, req.body);
    res.json({ product, message: "Product updated." });
  })
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await productModel.deleteProduct(req.params.id);
    res.json({ message: "Product deleted." });
  })
);

export default router;

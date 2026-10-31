import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { validate } from "../middleware/validate.js";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  subcategoryCreateSchema,
  subcategoryUpdateSchema,
} from "../schemas/category.js";
import * as categoryModel from "../models/category.js";
import { ApiError } from "../utils/ApiError.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const categories = await categoryModel.listCategories();
    res.json({ categories });
  })
);

router.get(
  "/:idOrSlug",
  asyncHandler(async (req, res) => {
    const category = await categoryModel.findCategory(req.params.idOrSlug);

    if (!category) throw new ApiError(404, "Category not found.");

    res.json({ category });
  })
);

router.post(
  "/",
  requireAdmin,
  validate(categoryCreateSchema),
  asyncHandler(async (req, res) => {
    const category = await categoryModel.createCategory(req.body);
    res.status(201).json({ category, message: "Category created." });
  })
);

router.patch(
  "/:id",
  requireAdmin,
  validate(categoryUpdateSchema),
  asyncHandler(async (req, res) => {
    const category = await categoryModel.updateCategory(req.params.id, req.body);
    res.json({ category, message: "Category updated." });
  })
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await categoryModel.deleteCategory(req.params.id);
    res.json({ message: "Category deleted." });
  })
);

router.post(
  "/:id/subcategories",
  requireAdmin,
  validate(subcategoryCreateSchema),
  asyncHandler(async (req, res) => {
    const subcategory = await categoryModel.createSubcategory(
      req.params.id,
      req.body
    );
    res.status(201).json({ subcategory, message: "Subcategory created." });
  })
);

router.patch(
  "/:id/subcategories/:subId",
  requireAdmin,
  validate(subcategoryUpdateSchema),
  asyncHandler(async (req, res) => {
    const subcategory = await categoryModel.updateSubcategory(
      req.params.id,
      req.params.subId,
      req.body
    );
    res.json({ subcategory, message: "Subcategory updated." });
  })
);

router.delete(
  "/:id/subcategories/:subId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await categoryModel.deleteSubcategory(req.params.id, req.params.subId);
    res.json({ message: "Subcategory deleted." });
  })
);

export default router;

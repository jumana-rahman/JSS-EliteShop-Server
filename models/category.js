import { db } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { slugify } from "../utils/slugify.js";
import { toObjectId } from "../utils/objectId.js";
import { uniqueSlug } from "../utils/uniqueSlug.js";

const categories = () => db.collection("categories");
const subcategories = () => db.collection("subcategories");

function serializeSubcategory(sub) {
  return {
    id: String(sub._id),
    name: sub.name,
    slug: sub.slug,
    categoryId: String(sub.category_id),
    createdAt: sub.created_at,
    updatedAt: sub.updated_at,
  };
}

export function serializeCategory(category, subs = []) {
  return {
    id: String(category._id),
    name: category.name,
    label: category.name,
    slug: category.slug,
    color: category.color || "#831843",
    description: category.description || "",
    subcategories: subs.map(serializeSubcategory),
    createdAt: category.created_at,
    updatedAt: category.updated_at,
  };
}

export async function listCategories() {
  const [categoryList, subList] = await Promise.all([
    categories().find().sort({ name: 1 }).toArray(),
    subcategories().find().sort({ name: 1 }).toArray(),
  ]);

  const subsByCategory = new Map();
  for (const sub of subList) {
    const key = String(sub.category_id);
    if (!subsByCategory.has(key)) subsByCategory.set(key, []);
    subsByCategory.get(key).push(sub);
  }

  return categoryList.map((category) =>
    serializeCategory(category, subsByCategory.get(String(category._id)) || [])
  );
}

export async function findCategory(idOrSlug) {
  const objectId = toObjectId(idOrSlug);
  const category = await categories().findOne(
    objectId ? { _id: objectId } : { slug: idOrSlug }
  );

  if (!category) return null;

  const subs = await subcategories()
    .find({ category_id: category._id })
    .sort({ name: 1 })
    .toArray();

  return serializeCategory(category, subs);
}

export async function createCategory(data) {
  const now = new Date();
  const slug = await uniqueSlug(categories(), slugify(data.name));

  const doc = {
    name: data.name,
    slug,
    color: data.color || "#831843",
    description: data.description || "",
    created_at: now,
    updated_at: now,
  };

  const result = await categories().insertOne(doc);
  return serializeCategory({ ...doc, _id: result.insertedId });
}

export async function updateCategory(id, data) {
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid category id.");

  const category = await categories().findOne({ _id: objectId });
  if (!category) throw new ApiError(404, "Category not found.");

  const patch = { ...data, updated_at: new Date() };
  if (data.name && data.name !== category.name) {
    patch.slug = await uniqueSlug(categories(), slugify(data.name), objectId);
  }

  await categories().updateOne({ _id: objectId }, { $set: patch });

  const updated = await categories().findOne({ _id: objectId });
  const subs = await subcategories()
    .find({ category_id: objectId })
    .sort({ name: 1 })
    .toArray();

  return serializeCategory(updated, subs);
}

export async function deleteCategory(id) {
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid category id.");

  const category = await categories().findOne({ _id: objectId });
  if (!category) throw new ApiError(404, "Category not found.");

  const productCount = await db
    .collection("products")
    .countDocuments({ category_id: objectId });

  if (productCount > 0) {
    throw new ApiError(409, "Move or delete the products in this category first.");
  }

  await subcategories().deleteMany({ category_id: objectId });
  await categories().deleteOne({ _id: objectId });
}

export async function createSubcategory(categoryId, data) {
  const objectId = toObjectId(categoryId);
  if (!objectId) throw new ApiError(400, "Invalid category id.");

  const category = await categories().findOne({ _id: objectId });
  if (!category) throw new ApiError(404, "Category not found.");

  const now = new Date();
  const slug = await uniqueSlug(subcategories(), slugify(data.name));

  const doc = {
    name: data.name,
    slug,
    category_id: objectId,
    created_at: now,
    updated_at: now,
  };

  const result = await subcategories().insertOne(doc);
  return serializeSubcategory({ ...doc, _id: result.insertedId });
}

export async function updateSubcategory(categoryId, subcategoryId, data) {
  const categoryObjectId = toObjectId(categoryId);
  const objectId = toObjectId(subcategoryId);
  if (!categoryObjectId || !objectId) throw new ApiError(400, "Invalid id.");

  const sub = await subcategories().findOne({ _id: objectId });
  if (!sub || String(sub.category_id) !== String(categoryObjectId)) {
    throw new ApiError(404, "Subcategory not found.");
  }

  const patch = { ...data, updated_at: new Date() };
  if (data.name && data.name !== sub.name) {
    patch.slug = await uniqueSlug(subcategories(), slugify(data.name), objectId);
  }

  await subcategories().updateOne({ _id: objectId }, { $set: patch });
  const updated = await subcategories().findOne({ _id: objectId });

  return serializeSubcategory(updated);
}

export async function deleteSubcategory(categoryId, subcategoryId) {
  const categoryObjectId = toObjectId(categoryId);
  const objectId = toObjectId(subcategoryId);
  if (!categoryObjectId || !objectId) throw new ApiError(400, "Invalid id.");

  const sub = await subcategories().findOne({ _id: objectId });
  if (!sub || String(sub.category_id) !== String(categoryObjectId)) {
    throw new ApiError(404, "Subcategory not found.");
  }

  const productCount = await db
    .collection("products")
    .countDocuments({ subcategory_id: objectId });

  if (productCount > 0) {
    throw new ApiError(409, "Move or delete the products in this subcategory first.");
  }

  await subcategories().deleteOne({ _id: objectId });
}

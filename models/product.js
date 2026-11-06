import { db } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { slugify } from "../utils/slugify.js";
import { toObjectId } from "../utils/objectId.js";
import { uniqueSlug } from "../utils/uniqueSlug.js";

const products = () => db.collection("products");
const categories = () => db.collection("categories");
const subcategories = () => db.collection("subcategories");

export const PLACEHOLDER_IMAGE =
  "https://placehold.co/600x600/f3f4f6/9ca3af?text=No+Image";

const SORTS = {
  popular: { sold_count: -1, view_count: -1, created_at: -1 },
  newest: { created_at: -1 },
  "price-low": { price: 1, created_at: -1 },
  "price-high": { price: -1, created_at: -1 },
  rating: { rating: -1, review_count: -1 },
  discount: { discount: -1, created_at: -1 },
  "stock-low": { stock: 1, created_at: -1 },
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeDiscount(price, originalPrice) {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

export function serializeProduct(
  product,
  categoryMap = new Map(),
  subcategoryMap = new Map()
) {
  const category = categoryMap.get(String(product.category_id));
  const subcategory = product.subcategory_id
    ? subcategoryMap.get(String(product.subcategory_id))
    : null;

  const images = (product.images || []).filter(Boolean);
  const originalPrice = product.original_price ?? product.price;

  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    description: product.description || "",
    brand: product.brand || "",
    category: category?.name || "Uncategorized",
    categoryId: product.category_id ? String(product.category_id) : null,
    categorySlug: category?.slug || "",
    subcategory: subcategory?.name || "",
    subcategoryId: product.subcategory_id ? String(product.subcategory_id) : null,
    subcategorySlug: subcategory?.slug || "",
    price: product.price,
    originalPrice,
    discount: product.discount ?? computeDiscount(product.price, originalPrice),
    rating: product.rating ?? 0,
    reviews: product.review_count ?? 0,
    image: images[0] || PLACEHOLDER_IMAGE,
    images: images.length ? images : [PLACEHOLDER_IMAGE],
    inStock: (product.stock ?? 0) > 0,
    stockCount: product.stock ?? 0,
    specs: product.specs || {},
    tags: product.tags || [],
    isFeatured: Boolean(product.is_featured),
    isTrending: Boolean(product.is_trending),
    isNew: Boolean(product.is_new),
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}

async function loadMaps(docs) {
  const categoryIds = [
    ...new Map(
      docs
        .filter((doc) => doc.category_id)
        .map((doc) => [String(doc.category_id), doc.category_id])
    ).values(),
  ];

  const subcategoryIds = [
    ...new Map(
      docs
        .filter((doc) => doc.subcategory_id)
        .map((doc) => [String(doc.subcategory_id), doc.subcategory_id])
    ).values(),
  ];

  const [categoryDocs, subcategoryDocs] = await Promise.all([
    categoryIds.length
      ? categories().find({ _id: { $in: categoryIds } }).toArray()
      : [],
    subcategoryIds.length
      ? subcategories().find({ _id: { $in: subcategoryIds } }).toArray()
      : [],
  ]);

  return {
    categoryMap: new Map(categoryDocs.map((doc) => [String(doc._id), doc])),
    subcategoryMap: new Map(
      subcategoryDocs.map((doc) => [String(doc._id), doc])
    ),
  };
}

export async function listProducts(params = {}) {
  const {
    search = "",
    category = "",
    subcategory = "",
    brand = "",
    minPrice,
    maxPrice,
    minRating,
    minDiscount,
    inStock,
    stockStatus,
    featured,
    trending,
    sort = "popular",
    page = 1,
    limit = 12,
  } = params;

  const filter = {};

  if (search.trim()) {
    const regex = new RegExp(escapeRegex(search.trim()), "i");
    const [matchingCategories, matchingSubcategories] = await Promise.all([
      categories().find({ name: regex }).project({ _id: 1 }).toArray(),
      subcategories().find({ name: regex }).project({ _id: 1 }).toArray(),
    ]);

    filter.$or = [
      { name: regex },
      { description: regex },
      { brand: regex },
      { tags: regex },
      { category_id: { $in: matchingCategories.map((doc) => doc._id) } },
      {
        subcategory_id: {
          $in: matchingSubcategories.map((doc) => doc._id),
        },
      },
    ];
  }

  if (category && category !== "all") {
    const categoryObjectId = toObjectId(category);
    const found = categoryObjectId
      ? await categories().findOne({ _id: categoryObjectId })
      : await categories().findOne({ slug: category });

    if (!found) {
      return {
        products: [],
        total: 0,
        page: 1,
        limit: Number(limit) || 12,
        totalPages: 0,
        brands: [],
      };
    }

    filter.category_id = found._id;
  }

  if (subcategory && subcategory !== "all") {
    const subcategoryObjectId = toObjectId(subcategory);
    const found = subcategoryObjectId
      ? await subcategories().findOne({ _id: subcategoryObjectId })
      : await subcategories().findOne({ slug: subcategory });

    if (!found) {
      return {
        products: [],
        total: 0,
        page: 1,
        limit: Number(limit) || 12,
        totalPages: 0,
        brands: [],
      };
    }

    filter.subcategory_id = found._id;
  }

  if (brand && brand !== "all") filter.brand = brand;

  const minPriceValue = Number(minPrice);
  const maxPriceValue = Number(maxPrice);

  if (Number.isFinite(minPriceValue) || Number.isFinite(maxPriceValue)) {
    filter.price = {};
    if (Number.isFinite(minPriceValue)) filter.price.$gte = minPriceValue;
    if (Number.isFinite(maxPriceValue)) filter.price.$lte = maxPriceValue;
  }

  const minRatingValue = Number(minRating);
  if (Number.isFinite(minRatingValue) && minRatingValue > 0) {
    filter.rating = { $gte: minRatingValue };
  }

  const minDiscountValue = Number(minDiscount);
  if (Number.isFinite(minDiscountValue) && minDiscountValue > 0) {
    filter.discount = { $gte: minDiscountValue };
  }

  if (stockStatus === "in") filter.stock = { $gt: 0 };
  else if (stockStatus === "low") filter.stock = { $gt: 0, $lt: 10 };
  else if (stockStatus === "out") filter.stock = { $lte: 0 };
  else if (inStock === true) filter.stock = { $gt: 0 };

  if (featured === true) filter.is_featured = true;
  if (trending === true) filter.is_trending = true;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 12));
  const skip = (safePage - 1) * safeLimit;
  const sortSpec = SORTS[sort] || SORTS.popular;

  const [docs, total, brands] = await Promise.all([
    products().find(filter).sort(sortSpec).skip(skip).limit(safeLimit).toArray(),
    products().countDocuments(filter),
    products().distinct("brand", { brand: { $nin: ["", null] } }),
  ]);

  const { categoryMap, subcategoryMap } = await loadMaps(docs);

  return {
    products: docs.map((doc) =>
      serializeProduct(doc, categoryMap, subcategoryMap)
    ),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
    brands: brands.filter(Boolean).sort((a, b) => a.localeCompare(b)),
  };
}

export async function findProduct(idOrSlug, { incrementView = false } = {}) {
  const objectId = toObjectId(idOrSlug);
  const product = await products().findOne(
    objectId ? { _id: objectId } : { slug: idOrSlug }
  );

  if (!product) return null;

  if (incrementView) {
    products()
      .updateOne({ _id: product._id }, { $inc: { view_count: 1 } })
      .catch(() => {});
  }

  const { categoryMap, subcategoryMap } = await loadMaps([product]);
  return serializeProduct(product, categoryMap, subcategoryMap);
}

export async function findRelatedProducts(idOrSlug, limit = 4) {
  const objectId = toObjectId(idOrSlug);
  const product = await products().findOne(
    objectId ? { _id: objectId } : { slug: idOrSlug }
  );

  if (!product) return [];

  const docs = await products()
    .find({
      category_id: product.category_id,
      _id: { $ne: product._id },
    })
    .sort({ sold_count: -1, created_at: -1 })
    .limit(Math.min(12, Math.max(1, Number(limit) || 4)))
    .toArray();

  const { categoryMap, subcategoryMap } = await loadMaps(docs);
  return docs.map((doc) =>
    serializeProduct(doc, categoryMap, subcategoryMap)
  );
}

async function resolveProductRelations(
  data,
  existing,
  { requireSubcategory = false } = {}
) {
  const fields = {};
  const hasCategory = data.categoryId !== undefined;
  const hasSubcategory = data.subcategoryId !== undefined;

  if (!hasCategory && !hasSubcategory) return fields;

  const categoryId = hasCategory
    ? data.categoryId
    : existing?.category_id
      ? String(existing.category_id)
      : null;

  if (!categoryId) throw new ApiError(422, "A category is required.");

  const categoryObjectId = toObjectId(categoryId);
  if (!categoryObjectId) throw new ApiError(422, "Invalid category.");

  const category = await categories().findOne({ _id: categoryObjectId });
  if (!category) throw new ApiError(422, "Category not found.");

  let subcategoryObjectId = null;

  if (hasSubcategory) {
    if (!data.subcategoryId) {
      throw new ApiError(422, "A subcategory is required.");
    }

    subcategoryObjectId = toObjectId(data.subcategoryId);
    if (!subcategoryObjectId) {
      throw new ApiError(422, "Invalid subcategory.");
    }
  } else if (existing?.subcategory_id) {
    subcategoryObjectId = existing.subcategory_id;
  }

  if (subcategoryObjectId) {
    const subcategory = await subcategories().findOne({
      _id: subcategoryObjectId,
    });

    if (
      !subcategory ||
      String(subcategory.category_id) !== String(categoryObjectId)
    ) {
      throw new ApiError(
        422,
        "Subcategory does not belong to the selected category."
      );
    }

    fields.subcategory_id = subcategoryObjectId;
  } else {
    if (requireSubcategory) {
      throw new ApiError(422, "A subcategory is required.");
    }

    fields.subcategory_id = null;
  }

  fields.category_id = categoryObjectId;
  return fields;
}

export async function createProduct(data) {
  if (!Array.isArray(data.images) || data.images.length === 0) {
    throw new ApiError(422, "At least one image is required.");
  }

  const now = new Date();
  const relations = await resolveProductRelations(data, null, {
    requireSubcategory: true,
  });
  const originalPrice = data.originalPrice ?? data.price;
  const slug = await uniqueSlug(products(), slugify(data.name));

  const doc = {
    name: data.name,
    slug,
    description: data.description,
    brand: data.brand || "",
    category_id: relations.category_id,
    subcategory_id: relations.subcategory_id ?? null,
    price: data.price,
    original_price: originalPrice,
    discount: computeDiscount(data.price, originalPrice),
    stock: data.stock,
    images: data.images || [],
    specs: data.specs || {},
    tags: data.tags || [],
    is_featured: Boolean(data.isFeatured),
    is_trending: Boolean(data.isTrending),
    is_new: Boolean(data.isNew),
    rating: 0,
    review_count: 0,
    view_count: 0,
    sold_count: 0,
    created_at: now,
    updated_at: now,
  };

  const result = await products().insertOne(doc);
  const created = { ...doc, _id: result.insertedId };
  const { categoryMap, subcategoryMap } = await loadMaps([created]);
  return serializeProduct(created, categoryMap, subcategoryMap);
}

export async function updateProduct(id, data) {
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid product id.");

  const existing = await products().findOne({ _id: objectId });
  if (!existing) throw new ApiError(404, "Product not found.");

  if (
    data.images !== undefined &&
    (!Array.isArray(data.images) || data.images.length === 0)
  ) {
    throw new ApiError(422, "At least one image is required.");
  }

  const patch = { updated_at: new Date() };

  if (data.name !== undefined) {
    patch.name = data.name;
    if (data.name !== existing.name) {
      patch.slug = await uniqueSlug(products(), slugify(data.name), objectId);
    }
  }

  if (data.description !== undefined) patch.description = data.description;
  if (data.brand !== undefined) patch.brand = data.brand;
  if (data.stock !== undefined) patch.stock = data.stock;
  if (data.images !== undefined) patch.images = data.images;
  if (data.specs !== undefined) patch.specs = data.specs;
  if (data.tags !== undefined) patch.tags = data.tags;
  if (data.isFeatured !== undefined) patch.is_featured = Boolean(data.isFeatured);
  if (data.isTrending !== undefined) patch.is_trending = Boolean(data.isTrending);
  if (data.isNew !== undefined) patch.is_new = Boolean(data.isNew);

  if (data.price !== undefined || data.originalPrice !== undefined) {
    patch.price = data.price ?? existing.price;
    patch.original_price =
      data.originalPrice ?? existing.original_price ?? patch.price;
    patch.discount = computeDiscount(patch.price, patch.original_price);
  }

  const relationFields = await resolveProductRelations(data, existing);
  Object.assign(patch, relationFields);

  await products().updateOne({ _id: objectId }, { $set: patch });

  const updated = await products().findOne({ _id: objectId });
  const { categoryMap, subcategoryMap } = await loadMaps([updated]);
  return serializeProduct(updated, categoryMap, subcategoryMap);
}

export async function deleteProduct(id) {
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid product id.");

  const result = await products().deleteOne({ _id: objectId });
  if (result.deletedCount === 0) throw new ApiError(404, "Product not found.");
}

export async function bulkUpdateStock(items) {
  const now = new Date();

  const operations = items.map(({ id, stock }) => {
    const objectId = toObjectId(id);
    if (!objectId) throw new ApiError(400, `Invalid product id: ${id}`);

    return {
      updateOne: {
        filter: { _id: objectId },
        update: { $set: { stock, updated_at: now } },
      },
    };
  });

  const result = await products().bulkWrite(operations);
  return result.modifiedCount;
}

export async function getAdminStats() {
  const [
    totalProducts,
    lowStock,
    outOfStock,
    totalCategories,
    totalSubcategories,
    totalUsers,
    totalOrders,
    pendingOrders,
    revenue,
  ] = await Promise.all([
    products().countDocuments(),
    products().countDocuments({ stock: { $gt: 0, $lt: 10 } }),
    products().countDocuments({ stock: { $lte: 0 } }),
    categories().countDocuments(),
    subcategories().countDocuments(),
    db.collection("user").countDocuments(),
    db.collection("orders").countDocuments(),
    db.collection("orders").countDocuments({ status: "Placed" }),
    db
      .collection("orders")
      .aggregate([
        { $match: { payment_status: "paid" } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ])
      .toArray(),
  ]);

  return {
    totalProducts,
    lowStock,
    outOfStock,
    totalCategories,
    totalSubcategories,
    totalUsers,
    totalOrders,
    pendingOrders,
    totalRevenue: revenue[0]?.total || 0,
  };
}

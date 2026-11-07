import { db } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { toObjectId } from "../utils/objectId.js";
import { PLACEHOLDER_IMAGE } from "./product.js";

const reviews = () => db.collection("reviews");
const products = () => db.collection("products");
const orders = () => db.collection("orders");
const users = () => db.collection("user");

function toUserId(userId) {
  const objectId = toObjectId(userId);
  if (!objectId) throw new ApiError(401, "Invalid user session.");
  return objectId;
}

function toProductId(productId) {
  const objectId = toObjectId(productId);
  if (!objectId) throw new ApiError(400, "Invalid product id.");
  return objectId;
}

function serializeReview(doc, productMap, userMap) {
  const product = productMap.get(String(doc.product_id));
  const user = userMap.get(String(doc.user_id));
  const images = (product?.images || []).filter(Boolean);

  return {
    id: String(doc._id),
    productId: String(doc.product_id),
    product: product
      ? {
          id: String(product._id),
          name: product.name,
          slug: product.slug,
          image: images[0] || PLACEHOLDER_IMAGE,
        }
      : null,
    user: {
      id: String(doc.user_id),
      name: user?.name || "EliteShop Customer",
      avatar: user?.image || "",
    },
    rating: doc.rating,
    title: doc.title || "",
    text: doc.text,
    orderId: doc.order_id ? String(doc.order_id) : null,
    verifiedPurchase: true,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

async function loadProductAndUserMaps(docs) {
  const productIds = [
    ...new Map(
      docs
        .filter((doc) => doc.product_id)
        .map((doc) => [String(doc.product_id), doc.product_id])
    ).values(),
  ];
  const userIds = [
    ...new Map(
      docs
        .filter((doc) => doc.user_id)
        .map((doc) => [String(doc.user_id), doc.user_id])
    ).values(),
  ];

  const [productDocs, userDocs] = await Promise.all([
    productIds.length
      ? products().find({ _id: { $in: productIds } }).toArray()
      : [],
    userIds.length
      ? users().find({ _id: { $in: userIds } }).toArray()
      : [],
  ]);

  return {
    productMap: new Map(productDocs.map((doc) => [String(doc._id), doc])),
    userMap: new Map(userDocs.map((doc) => [String(doc._id), doc])),
  };
}

function emptyBreakdown() {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function buildSummary(aggregation) {
  const breakdown = emptyBreakdown();
  let total = 0;
  let weighted = 0;

  for (const row of aggregation) {
    const star = Number(row._id);
    if (!star || star < 1 || star > 5) continue;
    breakdown[star] = row.count;
    total += row.count;
    weighted += star * row.count;
  }

  return {
    average: total ? Math.round((weighted / total) * 10) / 10 : 0,
    count: total,
    breakdown,
  };
}

async function getSummary(productId) {
  const aggregation = await reviews()
    .aggregate([
      { $match: { product_id: productId } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
    ])
    .toArray();

  return buildSummary(aggregation);
}

export async function recomputeProductRating(productId) {
  const objectId = toProductId(productId);
  const summary = await getSummary(objectId);

  await products().updateOne(
    { _id: objectId },
    {
      $set: {
        rating: summary.average,
        review_count: summary.count,
        updated_at: new Date(),
      },
    }
  );

  return summary;
}

export async function listProductReviews(productId, { page = 1, limit = 6 } = {}) {
  const objectId = toProductId(productId);
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 6));

  const [docs, total, summary] = await Promise.all([
    reviews()
      .find({ product_id: objectId })
      .sort({ created_at: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .toArray(),
    reviews().countDocuments({ product_id: objectId }),
    getSummary(objectId),
  ]);

  const { productMap, userMap } = await loadProductAndUserMaps(docs);

  return {
    reviews: docs.map((doc) => serializeReview(doc, productMap, userMap)),
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
    summary,
  };
}

export async function listFeaturedReviews(limit = 6) {
  const safeLimit = Math.min(12, Math.max(1, Number(limit) || 6));
  const docs = await reviews()
    .find({ rating: { $gte: 4 } })
    .sort({ created_at: -1 })
    .limit(safeLimit)
    .toArray();

  const { productMap, userMap } = await loadProductAndUserMaps(docs);
  return docs.map((doc) => serializeReview(doc, productMap, userMap));
}

export async function listUserReviews(userId) {
  const user_id = toUserId(userId);
  const docs = await reviews()
    .find({ user_id })
    .sort({ created_at: -1 })
    .toArray();

  const { productMap, userMap } = await loadProductAndUserMaps(docs);
  return docs.map((doc) => serializeReview(doc, productMap, userMap));
}

export async function getReviewEligibility(userId, productId) {
  const user_id = toUserId(userId);
  const product_id = toProductId(productId);

  const [existing, deliveredOrder] = await Promise.all([
    reviews().findOne(
      { user_id, product_id },
      { projection: { _id: 1 } }
    ),
    orders().findOne(
      {
        user_id,
        status: "Delivered",
        "items.product_id": product_id,
      },
      { projection: { _id: 1 }, sort: { created_at: -1 } }
    ),
  ]);

  if (existing) {
    return {
      canReview: false,
      hasReviewed: true,
      purchased: Boolean(deliveredOrder),
      reason: "You already reviewed this product.",
    };
  }

  if (!deliveredOrder) {
    return {
      canReview: false,
      hasReviewed: false,
      purchased: false,
      reason: "You can review this product after your order is delivered.",
    };
  }

  return {
    canReview: true,
    hasReviewed: false,
    purchased: true,
    reason: "",
  };
}

export async function createReview(userId, data) {
  const user_id = toUserId(userId);
  const product_id = toProductId(data.productId);

  const product = await products().findOne(
    { _id: product_id },
    { projection: { _id: 1, name: 1 } }
  );

  if (!product) throw new ApiError(404, "Product not found.");

  const deliveredOrder = await orders().findOne(
    {
      user_id,
      status: "Delivered",
      "items.product_id": product_id,
    },
    { projection: { _id: 1 }, sort: { created_at: -1 } }
  );

  if (!deliveredOrder) {
    throw new ApiError(
      403,
      "You can review this product after your order has been delivered."
    );
  }

  const existing = await reviews().findOne(
    { user_id, product_id },
    { projection: { _id: 1 } }
  );

  if (existing) {
    throw new ApiError(409, "You have already reviewed this product.");
  }

  const now = new Date();
  const doc = {
    user_id,
    product_id,
    order_id: deliveredOrder._id,
    rating: data.rating,
    title: data.title || "",
    text: data.text,
    created_at: now,
    updated_at: now,
  };

  let inserted;

  try {
    inserted = await reviews().insertOne(doc);
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "You have already reviewed this product.");
    }
    throw error;
  }

  const summary = await recomputeProductRating(product_id);
  const { productMap, userMap } = await loadProductAndUserMaps([
    { ...doc, _id: inserted.insertedId },
  ]);

  return {
    review: serializeReview(
      { ...doc, _id: inserted.insertedId },
      productMap,
      userMap
    ),
    summary,
  };
}

export async function deleteOwnReview(userId, reviewId) {
  const user_id = toUserId(userId);
  const objectId = toObjectId(reviewId);

  if (!objectId) throw new ApiError(400, "Invalid review id.");

  const review = await reviews().findOne({ _id: objectId });

  if (!review) throw new ApiError(404, "Review not found.");

  if (String(review.user_id) !== String(user_id)) {
    throw new ApiError(403, "You can only delete your own review.");
  }

  await reviews().deleteOne({ _id: objectId });
  await recomputeProductRating(review.product_id);

  return { message: "Review deleted." };
}

export async function listAdminReviews({
  productId,
  rating,
  page = 1,
  limit = 20,
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = {};

  if (productId) {
    filter.product_id = toProductId(productId);
  }

  const ratingValue = Number(rating);
  if (Number.isFinite(ratingValue) && ratingValue >= 1 && ratingValue <= 5) {
    filter.rating = ratingValue;
  }

  const [docs, total] = await Promise.all([
    reviews()
      .find(filter)
      .sort({ created_at: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .toArray(),
    reviews().countDocuments(filter),
  ]);

  const { productMap, userMap } = await loadProductAndUserMaps(docs);

  return {
    reviews: docs.map((doc) => serializeReview(doc, productMap, userMap)),
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function deleteReviewAsAdmin(reviewId) {
  const objectId = toObjectId(reviewId);

  if (!objectId) throw new ApiError(400, "Invalid review id.");

  const review = await reviews().findOne({ _id: objectId });

  if (!review) throw new ApiError(404, "Review not found.");

  await reviews().deleteOne({ _id: objectId });
  await recomputeProductRating(review.product_id);

  return { message: "Review deleted." };
}

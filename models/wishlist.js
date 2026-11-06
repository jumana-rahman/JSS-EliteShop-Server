import { db } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { toObjectId } from "../utils/objectId.js";
import { findProductsByIds } from "./product.js";

const wishlists = () => db.collection("wishlists");
const products = () => db.collection("products");

function toUserId(userId) {
  const objectId = toObjectId(userId);
  if (!objectId) throw new ApiError(401, "Invalid user session.");
  return objectId;
}

async function getWishlistDoc(userId) {
  const user_id = toUserId(userId);
  const existing = await wishlists().findOne({ user_id });
  if (existing) return existing;

  const now = new Date();

  try {
    await wishlists().updateOne(
      { user_id },
      {
        $setOnInsert: {
          user_id,
          items: [],
          created_at: now,
          updated_at: now,
        },
      },
      { upsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  return wishlists().findOne({ user_id });
}

async function saveItems(user_id, items) {
  const updated_at = new Date();
  await wishlists().updateOne({ user_id }, { $set: { items, updated_at } });
  return { user_id, items, updated_at };
}

function hasProduct(items, productId) {
  const id = String(productId);
  return items.some((item) => String(item.product_id) === id);
}

async function getProduct(productId) {
  const objectId = toObjectId(productId);
  if (!objectId) throw new ApiError(400, "Invalid product id.");

  const product = await products().findOne({ _id: objectId });
  if (!product) throw new ApiError(404, "Product not found.");

  return product;
}

async function serializeWishlist(doc) {
  const items = Array.isArray(doc?.items) ? doc.items : [];
  const productMap = await findProductsByIds(
    items.map((item) => item.product_id)
  );

  const serializedItems = items
    .map((item) => {
      const product = productMap.get(String(item.product_id));
      if (!product) return null;
      return { ...product, addedAt: item.added_at };
    })
    .filter(Boolean);

  return {
    items: serializedItems,
    count: serializedItems.length,
    updatedAt: doc?.updated_at ?? doc?.created_at ?? null,
  };
}

export async function getWishlist(userId) {
  return serializeWishlist(await getWishlistDoc(userId));
}

export async function addWishlistItem(userId, productId) {
  const product = await getProduct(productId);
  const wishlist = await getWishlistDoc(userId);
  const items = (wishlist.items || []).map((item) => ({ ...item }));

  if (!hasProduct(items, product._id)) {
    items.push({ product_id: product._id, added_at: new Date() });
  }

  return serializeWishlist(await saveItems(wishlist.user_id, items));
}

export async function removeWishlistItem(userId, productId) {
  const wishlist = await getWishlistDoc(userId);
  const id = String(productId);
  const items = (wishlist.items || []).filter(
    (item) => String(item.product_id) !== id
  );

  return serializeWishlist(await saveItems(wishlist.user_id, items));
}

export async function clearWishlist(userId) {
  const wishlist = await getWishlistDoc(userId);
  return serializeWishlist(await saveItems(wishlist.user_id, []));
}

export async function mergeWishlist(userId, productIds = []) {
  const wishlist = await getWishlistDoc(userId);
  if (!productIds.length) return serializeWishlist(wishlist);

  const objectIds = [
    ...new Set(
      productIds
        .map((id) => toObjectId(id))
        .filter(Boolean)
        .map(String)
    ),
  ].map((id) => toObjectId(id));

  const existingProducts = await products()
    .find({ _id: { $in: objectIds } })
    .project({ _id: 1 })
    .toArray();

  const items = (wishlist.items || []).map((item) => ({ ...item }));
  const now = new Date();

  for (const product of existingProducts) {
    if (!hasProduct(items, product._id)) {
      items.push({ product_id: product._id, added_at: now });
    }
  }

  return serializeWishlist(await saveItems(wishlist.user_id, items));
}

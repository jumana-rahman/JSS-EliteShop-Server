import { db } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { toObjectId } from "../utils/objectId.js";
import { findProductsByIds } from "./product.js";

const carts = () => db.collection("carts");
const products = () => db.collection("products");

function toUserId(userId) {
  const objectId = toObjectId(userId);
  if (!objectId) throw new ApiError(401, "Invalid user session.");
  return objectId;
}

async function getCartDoc(userId) {
  const user_id = toUserId(userId);
  const existing = await carts().findOne({ user_id });
  if (existing) return existing;

  const now = new Date();

  try {
    await carts().updateOne(
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

  return carts().findOne({ user_id });
}

async function saveItems(user_id, items) {
  const updated_at = new Date();
  await carts().updateOne({ user_id }, { $set: { items, updated_at } });
  return { user_id, items, updated_at };
}

function stockFor(product) {
  return Math.max(0, Number(product.stock) || 0);
}

function assertQuantityAvailable(quantity, product) {
  const stock = stockFor(product);

  if (stock <= 0) {
    throw new ApiError(409, "This product is out of stock.");
  }

  if (quantity > stock) {
    throw new ApiError(
      409,
      `Only ${stock} item${stock === 1 ? "" : "s"} available in stock.`
    );
  }
}

function itemIndex(items, productId) {
  const id = String(productId);
  return items.findIndex((item) => String(item.product_id) === id);
}

async function getProduct(productId) {
  const objectId = toObjectId(productId);
  if (!objectId) throw new ApiError(400, "Invalid product id.");

  const product = await products().findOne({ _id: objectId });
  if (!product) throw new ApiError(404, "Product not found.");

  return product;
}

async function serializeCart(doc) {
  const items = Array.isArray(doc?.items) ? doc.items : [];
  const productMap = await findProductsByIds(
    items.map((item) => item.product_id)
  );

  const serializedItems = items
    .map((item) => {
      const product = productMap.get(String(item.product_id));
      if (!product) return null;

      return {
        product,
        quantity: item.quantity,
        priceAtAddition: item.price_at_addition,
        addedAt: item.added_at,
      };
    })
    .filter(Boolean);

  return {
    items: serializedItems,
    itemCount: serializedItems.reduce((sum, item) => sum + item.quantity, 0),
    updatedAt: doc?.updated_at ?? doc?.created_at ?? null,
  };
}

export async function getCart(userId) {
  return serializeCart(await getCartDoc(userId));
}

export async function addCartItem(userId, productId, quantity = 1) {
  const product = await getProduct(productId);
  const cart = await getCartDoc(userId);
  const items = (cart.items || []).map((item) => ({ ...item }));
  const index = itemIndex(items, product._id);
  const nextQuantity = (index >= 0 ? items[index].quantity : 0) + quantity;

  assertQuantityAvailable(nextQuantity, product);

  if (index >= 0) {
    items[index].quantity = nextQuantity;
  } else {
    items.push({
      product_id: product._id,
      quantity: nextQuantity,
      price_at_addition: product.price,
      added_at: new Date(),
    });
  }

  return serializeCart(await saveItems(cart.user_id, items));
}

export async function updateCartItem(userId, productId, quantity) {
  const cart = await getCartDoc(userId);
  const objectId = toObjectId(productId);
  if (!objectId) throw new ApiError(400, "Invalid product id.");

  const items = (cart.items || []).map((item) => ({ ...item }));
  const index = itemIndex(items, objectId);

  if (index < 0) {
    throw new ApiError(404, "This item is not in your cart.");
  }

  if (quantity <= 0) {
    items.splice(index, 1);
  } else {
    const product = await getProduct(productId);
    assertQuantityAvailable(quantity, product);
    items[index].quantity = quantity;
  }

  return serializeCart(await saveItems(cart.user_id, items));
}

export async function removeCartItem(userId, productId) {
  const cart = await getCartDoc(userId);
  const id = String(productId);
  const items = (cart.items || []).filter(
    (item) => String(item.product_id) !== id
  );

  return serializeCart(await saveItems(cart.user_id, items));
}

export async function clearCart(userId) {
  const cart = await getCartDoc(userId);
  return serializeCart(await saveItems(cart.user_id, []));
}

export async function mergeCart(userId, guestItems = []) {
  const cart = await getCartDoc(userId);
  if (!guestItems.length) return serializeCart(cart);

  const productIds = [
    ...new Set(
      guestItems
        .map((item) => toObjectId(item.productId))
        .filter(Boolean)
        .map(String)
    ),
  ].map((id) => toObjectId(id));

  const productDocs = await products()
    .find({ _id: { $in: productIds } })
    .toArray();
  const productMap = new Map(
    productDocs.map((product) => [String(product._id), product])
  );

  const items = (cart.items || []).map((item) => ({ ...item }));

  for (const guestItem of guestItems) {
    const guestProductId = toObjectId(guestItem.productId);
    const product = guestProductId
      ? productMap.get(String(guestProductId))
      : null;
    if (!product) continue;

    const stock = stockFor(product);
    if (stock <= 0) continue;

    const index = itemIndex(items, product._id);
    const currentQuantity = index >= 0 ? items[index].quantity : 0;
    const nextQuantity = Math.min(
      stock,
      currentQuantity + Number(guestItem.quantity || 1)
    );

    if (index >= 0) {
      items[index].quantity = nextQuantity;
    } else {
      items.push({
        product_id: product._id,
        quantity: nextQuantity,
        price_at_addition: product.price,
        added_at: new Date(),
      });
    }
  }

  return serializeCart(await saveItems(cart.user_id, items));
}

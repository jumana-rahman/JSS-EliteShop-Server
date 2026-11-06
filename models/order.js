import { randomInt } from "node:crypto";
import { db } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { toObjectId } from "../utils/objectId.js";
import { createAddress, getAddressSnapshot } from "./address.js";
import { PLACEHOLDER_IMAGE } from "./product.js";

const orders = () => db.collection("orders");
const carts = () => db.collection("carts");
const products = () => db.collection("products");

const SHIPPING_FEE = 9.99;
const FREE_SHIPPING_THRESHOLD = 50;

function toUserId(userId) {
  const objectId = toObjectId(userId);
  if (!objectId) throw new ApiError(401, "Invalid user session.");
  return objectId;
}

export function serializeOrder(doc) {
  return {
    id: String(doc._id),
    orderNumber: doc.order_number,
    status: doc.status,
    paymentStatus: doc.payment_status,
    paymentMethod: doc.payment_method,
    deliveryStatus: doc.delivery_status,
    items: (doc.items || []).map((item) => ({
      productId: String(item.product_id),
      productName: item.product_name,
      image: item.image || "",
      quantity: item.quantity,
      unitPrice: item.unit_price,
      totalPrice: item.total_price,
    })),
    subtotal: doc.subtotal,
    shipping: doc.shipping,
    discount: doc.discount ?? 0,
    total: doc.total,
    address: {
      name: doc.address?.name || "",
      phone: doc.address?.phone || "",
      addressLine: doc.address?.address_line || "",
      city: doc.address?.city || "",
      postalCode: doc.address?.postal_code || "",
    },
    notes: doc.notes || "",
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

async function generateOrderNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `JSS${randomInt(100000, 1000000)}`;
    const existing = await orders().findOne(
      { order_number: candidate },
      { projection: { _id: 1 } }
    );

    if (!existing) return candidate;
  }

  throw new ApiError(500, "Could not generate an order number. Please try again.");
}

function addressSnapshotFromInput(address) {
  return {
    name: address.name,
    phone: address.phone,
    addressLine: address.addressLine,
    city: address.city,
    postalCode: address.postalCode,
  };
}

async function loadCartItems(user_id) {
  const cart = await carts().findOne({ user_id });
  const cartItems = Array.isArray(cart?.items) ? cart.items : [];

  if (cartItems.length === 0) {
    throw new ApiError(422, "Your cart is empty.");
  }

  const productIds = cartItems
    .map((item) => toObjectId(String(item.product_id)))
    .filter(Boolean);

  const productDocs = await products()
    .find({ _id: { $in: productIds } })
    .toArray();
  const productMap = new Map(
    productDocs.map((product) => [String(product._id), product])
  );

  return cartItems.map((item) => {
    const product = productMap.get(String(item.product_id));

    if (!product) {
      throw new ApiError(
        409,
        "Some items in your cart are no longer available. Please refresh your cart."
      );
    }

    return {
      product,
      quantity: Number(item.quantity) || 0,
    };
  });
}

async function rollbackStock(decremented) {
  await Promise.all(
    decremented.map(({ product_id, quantity }) =>
      products()
        .updateOne(
          { _id: product_id },
          { $inc: { stock: quantity, sold_count: -quantity } }
        )
        .catch(() => {})
    )
  );
}

export async function createOrder(userId, data) {
  const user_id = toUserId(userId);
  const cartItems = await loadCartItems(user_id);

  const orderItems = [];
  const decremented = [];

  for (const { product, quantity } of cartItems) {
    if (quantity <= 0) {
      throw new ApiError(422, "Cart quantities must be at least 1.");
    }

    const stock = Number(product.stock) || 0;

    if (stock < quantity) {
      throw new ApiError(
        409,
        `${product.name} only has ${stock} item${stock === 1 ? "" : "s"} left in stock.`
      );
    }

    orderItems.push({
      product_id: product._id,
      product_name: product.name,
      image: (Array.isArray(product.images) && product.images[0]) || PLACEHOLDER_IMAGE,
      quantity,
      unit_price: product.price,
      total_price: product.price * quantity,
    });
  }

  for (const item of orderItems) {
    const result = await products().updateOne(
      { _id: item.product_id, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity, sold_count: item.quantity } }
    );

    if (result.modifiedCount === 0) {
      await rollbackStock(decremented);
      throw new ApiError(
        409,
        `${item.product_name} is no longer available in the requested quantity.`
      );
    }

    decremented.push({
      product_id: item.product_id,
      quantity: item.quantity,
    });
  }

  let address;

  try {
    if (data.addressId) {
      address = await getAddressSnapshot(userId, data.addressId);
    } else {
      address = addressSnapshotFromInput(data.address);

      if (data.saveAddress) {
        await createAddress(userId, {
          name: address.name,
          phone: address.phone,
          addressLine: address.addressLine,
          city: address.city,
          postalCode: address.postalCode,
          isDefault: false,
        });
      }
    }
  } catch (error) {
    await rollbackStock(decremented);
    throw error;
  }

  const subtotal = orderItems.reduce(
    (sum, item) => sum + item.total_price,
    0
  );
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const discount = 0;
  const total = subtotal + shipping - discount;

  const now = new Date();
  const orderNumber = await generateOrderNumber();

  const doc = {
    user_id,
    order_number: orderNumber,
    status: "Placed",
    payment_status: "unpaid",
    payment_method: "cod",
    delivery_status: "Pending",
    items: orderItems,
    subtotal,
    shipping,
    discount,
    total,
    address: {
      name: address.name,
      phone: address.phone,
      address_line: address.addressLine,
      city: address.city,
      postal_code: address.postalCode,
    },
    notes: data.notes || "",
    created_at: now,
    updated_at: now,
  };

  let inserted;

  try {
    inserted = await orders().insertOne(doc);
  } catch (error) {
    await rollbackStock(decremented);
    throw error;
  }

  await carts().updateOne(
    { user_id },
    { $set: { items: [], updated_at: now } }
  );

  return serializeOrder({ ...doc, _id: inserted.insertedId });
}

export async function listOrders(userId) {
  const user_id = toUserId(userId);
  const docs = await orders()
    .find({ user_id })
    .sort({ created_at: -1 })
    .toArray();

  return docs.map(serializeOrder);
}

export async function getOrder(userId, idOrNumber) {
  const user_id = toUserId(userId);
  const objectId = toObjectId(idOrNumber);

  const filter = objectId
    ? { _id: objectId, user_id }
    : { order_number: idOrNumber, user_id };

  const order = await orders().findOne(filter);

  if (!order) throw new ApiError(404, "Order not found.");

  return serializeOrder(order);
}

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
    statusHistory: serializeStatusHistory(doc),
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

function serializeStatusHistory(doc) {
  const history = Array.isArray(doc.status_history) ? doc.status_history : [];

  if (history.length === 0) {
    return [
      {
        status: doc.status,
        note: "",
        changedAt: doc.created_at,
      },
    ];
  }

  return history
    .filter((entry) => entry.status)
    .map((entry) => ({
      status: entry.status,
      note: entry.note || "",
      changedAt: entry.changed_at || doc.created_at,
    }));
}

export function serializeAdminOrder(doc, customer = null) {
  return {
    ...serializeOrder(doc),
    customer: customer
      ? {
          id: String(customer._id ?? customer.id ?? ""),
          name: customer.name || "",
          email: customer.email || "",
          phone: customer.phone || "",
        }
      : null,
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
    status_history: [
      {
        status: "Placed",
        note: "Order placed",
        changed_at: now,
      },
    ],
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

async function findOrderDocument(idOrNumber, user_id = null) {
  const objectId = toObjectId(idOrNumber);
  const filter = objectId
    ? { _id: objectId }
    : { order_number: idOrNumber };

  if (user_id) filter.user_id = user_id;

  const order = await orders().findOne(filter);

  if (!order) throw new ApiError(404, "Order not found.");

  return order;
}

export async function getOrder(userId, idOrNumber) {
  const user_id = toUserId(userId);
  return serializeOrder(await findOrderDocument(idOrNumber, user_id));
}

async function loadCustomerMap(userIds) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (ids.length === 0) return new Map();

  const objectIds = ids.map(toObjectId).filter(Boolean);
  const conditions = [{ id: { $in: ids } }];
  if (objectIds.length > 0) conditions.push({ _id: { $in: objectIds } });

  const users = await db
    .collection("user")
    .find({ $or: conditions })
    .toArray();

  const map = new Map();

  for (const user of users) {
    map.set(String(user._id), user);
    if (user.id) map.set(String(user.id), user);
  }

  return map;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listAdminOrders({
  status,
  paymentStatus,
  deliveryStatus,
  search,
  userId,
  dateFrom,
  dateTo,
  page = 1,
  limit = 20,
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = {};

  if (status) filter.status = status;
  if (paymentStatus) filter.payment_status = paymentStatus;
  if (deliveryStatus) filter.delivery_status = deliveryStatus;

  if (userId) {
    const objectId = toObjectId(userId);
    if (!objectId) throw new ApiError(400, "Invalid user id.");
    filter.user_id = objectId;
  }

  if (dateFrom || dateTo) {
    filter.created_at = {};
    if (dateFrom) filter.created_at.$gte = dateFrom;
    if (dateTo) filter.created_at.$lte = dateTo;
  }

  const term = typeof search === "string" ? search.trim() : "";
  if (term) {
    const pattern = new RegExp(escapeRegex(term), "i");
    filter.$or = [
      { order_number: pattern },
      { "address.name": pattern },
      { "address.phone": pattern },
    ];
  }

  const [docs, total] = await Promise.all([
    orders()
      .find(filter)
      .sort({ created_at: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .toArray(),
    orders().countDocuments(filter),
  ]);

  const customerMap = await loadCustomerMap(docs.map((doc) => doc.user_id));

  return {
    orders: docs.map((doc) =>
      serializeAdminOrder(doc, customerMap.get(String(doc.user_id)))
    ),
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function getAdminOrder(idOrNumber) {
  const order = await findOrderDocument(idOrNumber);
  const customerMap = await loadCustomerMap([order.user_id]);

  return serializeAdminOrder(order, customerMap.get(String(order.user_id)));
}

export async function updateAdminOrder(idOrNumber, data, adminUserId) {
  const order = await findOrderDocument(idOrNumber);
  const now = new Date();
  const update = { updated_at: now };
  let nextStatus = null;
  let historyNote = data.note || "";

  if (data.status && data.status !== order.status) {
    nextStatus = data.status;
  } else if (
    data.paymentStatus === "paid" &&
    order.payment_status !== "paid" &&
    order.status === "Placed"
  ) {
    // Paying for a fresh order moves it to the next tracking step.
    nextStatus = "Payment Confirmed";
    if (!historyNote) historyNote = "Payment confirmed";
  }

  if (nextStatus) {
    update.status = nextStatus;

    if (!data.deliveryStatus) {
      if (["Shipped", "Delivered", "Cancelled"].includes(nextStatus)) {
        update.delivery_status = nextStatus;
      } else if (nextStatus === "Processing") {
        update.delivery_status = "Processing";
      }
    }
  }

  if (
    data.paymentStatus &&
    data.paymentStatus !== order.payment_status
  ) {
    update.payment_status = data.paymentStatus;
  }

  if (
    data.deliveryStatus &&
    data.deliveryStatus !== order.delivery_status
  ) {
    update.delivery_status = data.deliveryStatus;
  }

  const operations = { $set: update };

  if (nextStatus) {
    operations.$push = {
      status_history: {
        status: nextStatus,
        note: historyNote,
        changed_by: toObjectId(adminUserId),
        changed_at: now,
      },
    };
  }

  await orders().updateOne({ _id: order._id }, operations);

  return getAdminOrder(String(order._id));
}

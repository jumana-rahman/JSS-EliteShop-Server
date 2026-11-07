import { db } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { toObjectId } from "../utils/objectId.js";
import { listAdminOrders } from "./order.js";

const users = () => db.collection("user");
const orders = () => db.collection("orders");
const addresses = () => db.collection("addresses");
const reviews = () => db.collection("reviews");

function isActiveUser(doc) {
  return doc.is_active !== false;
}

function serializeUser(doc, stats = null) {
  return {
    id: String(doc._id),
    name: doc.name || "",
    email: doc.email || "",
    phone: doc.phone || "",
    role: doc.role || "customer",
    image: doc.image || "",
    emailVerified: Boolean(doc.emailVerified),
    isActive: isActiveUser(doc),
    createdAt: doc.createdAt || doc.created_at || null,
    orderCount: stats?.count || 0,
    totalSpent: Math.round((stats?.total || 0) * 100) / 100,
  };
}

async function loadOrderStats(userIds) {
  if (!userIds.length) return new Map();

  const rows = await orders()
    .aggregate([
      { $match: { user_id: { $in: userIds } } },
      {
        $group: {
          _id: "$user_id",
          count: { $sum: 1 },
          total: {
            $sum: {
              $cond: [{ $ne: ["$status", "Cancelled"] }, { $ifNull: ["$total", 0] }, 0],
            },
          },
        },
      },
    ])
    .toArray();

  return new Map(rows.map((row) => [String(row._id), row]));
}

export async function listUsers({
  search = "",
  status = "",
  page = 1,
  limit = 20,
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = {};

  if (status === "active") filter.is_active = { $ne: false };
  if (status === "inactive") filter.is_active = false;

  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  const [docs, total] = await Promise.all([
    users()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .toArray(),
    users().countDocuments(filter),
  ]);

  const statsMap = await loadOrderStats(docs.map((doc) => doc._id));

  return {
    users: docs.map((doc) => serializeUser(doc, statsMap.get(String(doc._id)))),
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function getUser(userId) {
  const objectId = toObjectId(userId);
  if (!objectId) throw new ApiError(400, "Invalid user id.");

  const doc = await users().findOne({ _id: objectId });
  if (!doc) throw new ApiError(404, "User not found.");

  const [statsMap, recentOrders, addressCount, reviewCount] = await Promise.all([
    loadOrderStats([doc._id]),
    listAdminOrders({ userId: String(doc._id), limit: 10 }),
    addresses().countDocuments({ user_id: doc._id }),
    reviews().countDocuments({ user_id: doc._id }),
  ]);

  return {
    user: serializeUser(doc, statsMap.get(String(doc._id))),
    orders: recentOrders.orders,
    addressCount,
    reviewCount,
  };
}

export async function setUserActive(userId, isActive, adminUserId = null) {
  const objectId = toObjectId(userId);
  if (!objectId) throw new ApiError(400, "Invalid user id.");

  if (adminUserId && String(adminUserId) === String(objectId) && !isActive) {
    throw new ApiError(400, "You cannot deactivate your own account.");
  }

  const doc = await users().findOne({ _id: objectId });
  if (!doc) throw new ApiError(404, "User not found.");

  await users().updateOne(
    { _id: objectId },
    { $set: { is_active: Boolean(isActive), updatedAt: new Date() } }
  );

  const updated = await users().findOne({ _id: objectId });
  const statsMap = await loadOrderStats([updated._id]);

  return {
    user: serializeUser(updated, statsMap.get(String(updated._id))),
    message: isActive ? "Account activated." : "Account deactivated.",
  };
}

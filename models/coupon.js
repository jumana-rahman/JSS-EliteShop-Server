import { db } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { toObjectId } from "../utils/objectId.js";
import { ObjectId } from "mongodb";
import { computeDiscount, roundMoney } from "../lib/pricing.js";

const coupons = () => db.collection("coupons");
const usages = () => db.collection("coupon_usages");

function asObjectId(value) {
  if (value instanceof ObjectId) return value;
  return toObjectId(String(value));
}

export const DISCOUNT_TYPES = ["percentage", "fixed"];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeCouponCode(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizeExpiry(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(422, "Enter a valid expiry date.");
  }

  return date;
}

export function serializeCoupon(doc) {
  const now = Date.now();
  const expiresAt = doc.expires_at || null;
  const maxUses = Number(doc.max_uses) || 0;
  const usedCount = Number(doc.used_count) || 0;

  return {
    id: String(doc._id),
    code: doc.code,
    description: doc.description || "",
    discountType: doc.discount_type,
    discountValue: doc.discount_value,
    minOrder: roundMoney(doc.min_order),
    maxUses,
    usedCount,
    expiresAt,
    isActive: doc.is_active !== false,
    isExpired: Boolean(expiresAt && new Date(expiresAt).getTime() < now),
    isExhausted: maxUses > 0 && usedCount >= maxUses,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

export async function listCoupons({
  search = "",
  status = "",
  page = 1,
  limit = 20,
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = {};
  const now = new Date();

  if (status === "active") {
    filter.is_active = { $ne: false };
    filter.$and = [
      { $or: [{ expires_at: null }, { expires_at: { $gt: now } }] },
    ];
  }

  if (status === "inactive") filter.is_active = false;
  if (status === "expired") filter.expires_at = { $lte: now };

  if (search) {
    const regex = new RegExp(escapeRegex(String(search).trim()), "i");
    filter.$or = [{ code: regex }, { description: regex }];
  }

  const [docs, total] = await Promise.all([
    coupons()
      .find(filter)
      .sort({ created_at: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .toArray(),
    coupons().countDocuments(filter),
  ]);

  return {
    coupons: docs.map(serializeCoupon),
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function getCoupon(id) {
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid coupon id.");

  const doc = await coupons().findOne({ _id: objectId });
  if (!doc) throw new ApiError(404, "Coupon not found.");

  return serializeCoupon(doc);
}

export async function createCoupon(data) {
  const code = normalizeCouponCode(data.code);
  const existing = await coupons().findOne({ code }, { projection: { _id: 1 } });

  if (existing) throw new ApiError(409, "A coupon with this code already exists.");

  const now = new Date();
  const doc = {
    code,
    description: data.description || "",
    discount_type: data.discountType,
    discount_value: roundMoney(data.discountValue),
    min_order: roundMoney(data.minOrder),
    max_uses: Number(data.maxUses) || 0,
    used_count: 0,
    expires_at: normalizeExpiry(data.expiresAt),
    is_active: data.isActive !== false,
    created_at: now,
    updated_at: now,
  };

  const result = await coupons().insertOne(doc);

  return serializeCoupon({ ...doc, _id: result.insertedId });
}

export async function updateCoupon(id, data) {
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid coupon id.");

  const existing = await coupons().findOne({ _id: objectId });
  if (!existing) throw new ApiError(404, "Coupon not found.");

  const update = { updated_at: new Date() };

  if (data.code !== undefined) {
    const code = normalizeCouponCode(data.code);

    if (code !== existing.code) {
      const duplicate = await coupons().findOne(
        { code, _id: { $ne: objectId } },
        { projection: { _id: 1 } }
      );

      if (duplicate) {
        throw new ApiError(409, "A coupon with this code already exists.");
      }
    }

    update.code = code;
  }

  if (data.description !== undefined) update.description = data.description;
  if (data.discountType !== undefined) update.discount_type = data.discountType;

  if (data.discountValue !== undefined) {
    update.discount_value = roundMoney(data.discountValue);
  }

  if (data.minOrder !== undefined) update.min_order = roundMoney(data.minOrder);
  if (data.maxUses !== undefined) update.max_uses = Number(data.maxUses) || 0;
  if (data.isActive !== undefined) update.is_active = Boolean(data.isActive);

  if (data.expiresAt !== undefined) {
    update.expires_at = normalizeExpiry(data.expiresAt);
  }

  const doc = await coupons().findOneAndUpdate(
    { _id: objectId },
    { $set: update },
    { returnDocument: "after" }
  );

  return serializeCoupon(doc);
}

export async function deleteCoupon(id) {
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid coupon id.");

  const result = await coupons().deleteOne({ _id: objectId });
  if (!result.deletedCount) throw new ApiError(404, "Coupon not found.");

  await usages().deleteMany({ coupon_id: objectId });

  return { message: "Coupon deleted." };
}

export async function findCouponByCode(code) {
  return coupons().findOne({ code: normalizeCouponCode(code) });
}

async function assertCouponUsable(coupon, userId, subtotal) {
  if (!coupon || coupon.is_active === false) {
    throw new ApiError(422, "This coupon is not active.");
  }

  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
    throw new ApiError(422, "This coupon has expired.");
  }

  const maxUses = Number(coupon.max_uses) || 0;
  const usedCount = Number(coupon.used_count) || 0;

  if (maxUses > 0 && usedCount >= maxUses) {
    throw new ApiError(422, "This coupon has reached its usage limit.");
  }

  const minOrder = Number(coupon.min_order) || 0;

  if (minOrder > 0 && Number(subtotal) < minOrder) {
    throw new ApiError(
      422,
      `Spend at least $${minOrder.toFixed(2)} to use this coupon.`
    );
  }

  const user_id = toObjectId(userId);

  if (user_id) {
    const previousUse = await usages().findOne(
      { coupon_id: coupon._id, user_id },
      { projection: { _id: 1 } }
    );

    if (previousUse) {
      throw new ApiError(422, "You have already used this coupon.");
    }
  }
}

export async function resolveCouponForUser(userId, code, subtotal) {
  const coupon = await findCouponByCode(code);

  if (!coupon) throw new ApiError(404, "Coupon not found.");

  await assertCouponUsable(coupon, userId, subtotal);

  return coupon;
}

export async function describeCouponForCart(userId, code, subtotal) {
  const coupon = await resolveCouponForUser(userId, code, subtotal);

  return {
    coupon: serializeCoupon(coupon),
    discount: computeDiscount(coupon, subtotal),
  };
}

/**
 * Atomically reserve one use of the coupon. Guards against two shoppers
 * racing for the last remaining use.
 */
export async function claimCoupon(coupon) {
  const now = new Date();
  const result = await coupons().updateOne(
    {
      _id: coupon._id,
      $expr: {
        $and: [
          { $ne: [{ $ifNull: ["$is_active", true] }, false] },
          {
            $or: [
              { $lte: [{ $ifNull: ["$max_uses", 0] }, 0] },
              {
                $lt: [
                  { $ifNull: ["$used_count", 0] },
                  { $ifNull: ["$max_uses", 0] },
                ],
              },
            ],
          },
          {
            $or: [
              { $eq: [{ $ifNull: ["$expires_at", null] }, null] },
              { $gt: ["$expires_at", now] },
            ],
          },
        ],
      },
    },
    { $inc: { used_count: 1 }, $set: { updated_at: now } }
  );

  if (result.modifiedCount === 0) {
    throw new ApiError(409, "This coupon is no longer available.");
  }
}

export async function recordCouponUsage(couponId, userId, orderId) {
  const coupon_id = asObjectId(couponId);
  const user_id = asObjectId(userId);
  const order_id = asObjectId(orderId);

  if (!coupon_id || !user_id || !order_id) return;

  await usages().insertOne({
    coupon_id,
    user_id,
    order_id,
    used_at: new Date(),
  });
}

export async function releaseCouponForOrder(couponId, orderId) {
  const coupon_id = asObjectId(couponId);
  const order_id = orderId ? asObjectId(orderId) : null;

  if (order_id) {
    await usages().deleteMany({ order_id });
  }

  if (coupon_id) {
    await coupons().updateOne(
      { _id: coupon_id, used_count: { $gt: 0 } },
      { $inc: { used_count: -1 }, $set: { updated_at: new Date() } }
    );
  }
}

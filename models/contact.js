import { db } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { toObjectId } from "../utils/objectId.js";

const messages = () => db.collection("contact_messages");

function serializeMessage(doc) {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    phone: doc.phone || "",
    subject: doc.subject,
    message: doc.message,
    isRead: Boolean(doc.is_read),
    createdAt: doc.created_at,
  };
}

export async function createContactMessage(data) {
  const now = new Date();
  const doc = {
    name: data.name,
    email: data.email,
    phone: data.phone || "",
    subject: data.subject,
    message: data.message,
    is_read: false,
    created_at: now,
  };

  const result = await messages().insertOne(doc);

  return serializeMessage({ ...doc, _id: result.insertedId });
}

export async function listContactMessages({
  status = "",
  search = "",
  page = 1,
  limit = 20,
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = {};

  if (status === "read") filter.is_read = true;
  if (status === "unread") filter.is_read = false;

  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ name: regex }, { email: regex }, { subject: regex }];
  }

  const [docs, total, unread] = await Promise.all([
    messages()
      .find(filter)
      .sort({ created_at: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .toArray(),
    messages().countDocuments(filter),
    messages().countDocuments({ is_read: false }),
  ]);

  return {
    messages: docs.map(serializeMessage),
    total,
    unread,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function getContactMessage(id) {
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid message id.");

  const doc = await messages().findOne({ _id: objectId });
  if (!doc) throw new ApiError(404, "Message not found.");

  return serializeMessage(doc);
}

export async function markContactMessage(id, isRead) {
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid message id.");

  const result = await messages().findOneAndUpdate(
    { _id: objectId },
    { $set: { is_read: Boolean(isRead) } },
    { returnDocument: "after" }
  );

  if (!result) throw new ApiError(404, "Message not found.");

  return serializeMessage(result);
}

export async function deleteContactMessage(id) {
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid message id.");

  const result = await messages().deleteOne({ _id: objectId });
  if (!result.deletedCount) throw new ApiError(404, "Message not found.");

  return { message: "Message deleted." };
}

export async function countUnreadMessages() {
  return messages().countDocuments({ is_read: false });
}

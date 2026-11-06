import { db } from "../config/database.js";
import { ApiError } from "../utils/ApiError.js";
import { toObjectId } from "../utils/objectId.js";

const addresses = () => db.collection("addresses");

function toUserId(userId) {
  const objectId = toObjectId(userId);
  if (!objectId) throw new ApiError(401, "Invalid user session.");
  return objectId;
}

export function serializeAddress(doc) {
  return {
    id: String(doc._id),
    name: doc.name,
    phone: doc.phone,
    addressLine: doc.address_line,
    city: doc.city,
    postalCode: doc.postal_code,
    isDefault: Boolean(doc.is_default),
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

async function unsetOtherDefaults(user_id, exceptId = null) {
  const filter = { user_id };
  if (exceptId) filter._id = { $ne: exceptId };

  await addresses().updateMany(filter, {
    $set: { is_default: false, updated_at: new Date() },
  });
}

async function findOwnedAddress(userId, id) {
  const user_id = toUserId(userId);
  const objectId = toObjectId(id);
  if (!objectId) throw new ApiError(400, "Invalid address id.");

  const address = await addresses().findOne({ _id: objectId, user_id });
  if (!address) throw new ApiError(404, "Address not found.");

  return address;
}

export async function listAddresses(userId) {
  const user_id = toUserId(userId);
  const docs = await addresses()
    .find({ user_id })
    .sort({ is_default: -1, created_at: -1 })
    .toArray();

  return docs.map(serializeAddress);
}

export async function getAddress(userId, id) {
  return serializeAddress(await findOwnedAddress(userId, id));
}

export async function getAddressSnapshot(userId, id) {
  const address = await findOwnedAddress(userId, id);

  return {
    name: address.name,
    phone: address.phone,
    addressLine: address.address_line,
    city: address.city,
    postalCode: address.postal_code,
  };
}

export async function createAddress(userId, data) {
  const user_id = toUserId(userId);
  const count = await addresses().countDocuments({ user_id });
  const isDefault = Boolean(data.isDefault) || count === 0;

  if (isDefault) await unsetOtherDefaults(user_id);

  const now = new Date();
  const doc = {
    user_id,
    name: data.name,
    phone: data.phone,
    address_line: data.addressLine,
    city: data.city,
    postal_code: data.postalCode,
    is_default: isDefault,
    created_at: now,
    updated_at: now,
  };

  const result = await addresses().insertOne(doc);
  return serializeAddress({ ...doc, _id: result.insertedId });
}

export async function updateAddress(userId, id, data) {
  const address = await findOwnedAddress(userId, id);
  const patch = { updated_at: new Date() };

  if (data.name !== undefined) patch.name = data.name;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.addressLine !== undefined) patch.address_line = data.addressLine;
  if (data.city !== undefined) patch.city = data.city;
  if (data.postalCode !== undefined) patch.postal_code = data.postalCode;

  if (data.isDefault === true) {
    await unsetOtherDefaults(address.user_id, address._id);
    patch.is_default = true;
  } else if (data.isDefault === false) {
    patch.is_default = false;
  }

  await addresses().updateOne({ _id: address._id }, { $set: patch });

  const updated = await addresses().findOne({ _id: address._id });
  return serializeAddress(updated);
}

export async function deleteAddress(userId, id) {
  const address = await findOwnedAddress(userId, id);

  await addresses().deleteOne({ _id: address._id });

  if (address.is_default) {
    const next = await addresses()
      .find({ user_id: address.user_id })
      .sort({ created_at: -1 })
      .limit(1)
      .next();

    if (next) {
      await addresses().updateOne(
        { _id: next._id },
        { $set: { is_default: true, updated_at: new Date() } }
      );
    }
  }

  return { id: String(address._id) };
}

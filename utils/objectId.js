import { ObjectId } from "mongodb";

export function toObjectId(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) {
    return null;
  }

  return new ObjectId(value);
}

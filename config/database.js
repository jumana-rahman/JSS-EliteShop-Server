import "dotenv/config";
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
const DB_NAME = "jss_eliteshop";
const db = client.db(DB_NAME);

export { client, db, DB_NAME };

async function safeCreateIndex(collection, spec, options = {}) {
  try {
    await db.collection(collection).createIndex(spec, options);
  } catch (error) {
    if (error?.code === 85 || error?.code === 86) return;
    console.warn(`Index warning on ${collection}:`, error.message);
  }
}

export async function createIndexes() {
  await safeCreateIndex("user", { email: 1 }, { unique: true });

  await safeCreateIndex("categories", { slug: 1 }, { unique: true });
  await safeCreateIndex("subcategories", { slug: 1 }, { unique: true });
  await safeCreateIndex("subcategories", { category_id: 1 });

  await safeCreateIndex("products", { slug: 1 }, { unique: true });
  await safeCreateIndex("products", { category_id: 1, subcategory_id: 1 });
  await safeCreateIndex("products", { is_featured: 1, is_trending: 1 });
  await safeCreateIndex("products", { price: 1 });
  await safeCreateIndex("products", { stock: 1 });
  await safeCreateIndex("products", { discount: -1 });
  await safeCreateIndex("products", { brand: 1 });
  await safeCreateIndex("products", { created_at: -1 });

  await safeCreateIndex("carts", { user_id: 1 }, { unique: true });
  await safeCreateIndex("wishlists", { user_id: 1 }, { unique: true });
  await safeCreateIndex("addresses", { user_id: 1 });

  await safeCreateIndex("orders", { order_number: 1 }, { unique: true });
  await safeCreateIndex("orders", { user_id: 1, created_at: -1 });
  await safeCreateIndex("orders", { status: 1 });
  await safeCreateIndex("payments", { order_id: 1 });

  await safeCreateIndex("reviews", { user_id: 1, product_id: 1 }, { unique: true });
  await safeCreateIndex("reviews", { product_id: 1, created_at: -1 });

  await safeCreateIndex("coupons", { code: 1 }, { unique: true });
  await safeCreateIndex("coupon_usages", { coupon_id: 1, user_id: 1 });

  await safeCreateIndex("contact_messages", { is_read: 1, created_at: -1 });
}

export async function connectDatabase() {
  await client.connect();
  await createIndexes();
}

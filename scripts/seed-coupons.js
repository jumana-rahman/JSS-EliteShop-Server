import dns from "node:dns";
import "dotenv/config";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { client, db } = await import("../config/database.js");

const coupons = [
  {
    code: "ELITE10",
    description: "10% off your entire order",
    discount_type: "percentage",
    discount_value: 10,
    min_order: 0,
    max_uses: 0,
    expires_at: null,
    is_active: true,
  },
  {
    code: "SAVE5",
    description: "$5 off orders over $25",
    discount_type: "fixed",
    discount_value: 5,
    min_order: 25,
    max_uses: 100,
    expires_at: null,
    is_active: true,
  },
];

const now = new Date();

for (const coupon of coupons) {
  const result = await db.collection("coupons").updateOne(
    { code: coupon.code },
    {
      $setOnInsert: {
        ...coupon,
        used_count: 0,
        created_at: now,
        updated_at: now,
      },
    },
    { upsert: true }
  );

  console.log(
    `${coupon.code}: ${result.upsertedCount ? "created" : "already exists"}`
  );
}

await client.close();
console.log("Coupons are ready.");

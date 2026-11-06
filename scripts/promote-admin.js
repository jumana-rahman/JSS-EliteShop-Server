import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import "dotenv/config";
import { MongoClient } from "mongodb";

const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/promote-admin.js <email>");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);

try {
  await client.connect();

  const users = client.db("jss_eliteshop").collection("user");
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const user = await users.findOne({
    email: { $regex: `^${escaped}$`, $options: "i" },
  });

  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exitCode = 1;
  } else {
    await users.updateOne({ _id: user._id }, { $set: { role: "admin" } });
    console.log(`Promoted ${user.email} to admin.`);
  }
} catch (error) {
  console.error("Failed to promote user:", error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}

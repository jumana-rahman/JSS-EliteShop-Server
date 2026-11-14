import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import { connectDatabase } from "../config/database.js";
import app from "../app.js";

// Cache the connection between warm serverless invocations so the
// database/index setup only runs once per function instance.
let databaseReady = null;

function ensureDatabase() {
  if (!databaseReady) {
    databaseReady = connectDatabase().catch((error) => {
      databaseReady = null;
      throw error;
    });
  }

  return databaseReady;
}

export default async function handler(req, res) {
  try {
    await ensureDatabase();
  } catch (error) {
    console.error("Database connection failed:", error);

    res.status(503).json({
      message: "Database unavailable. Please try again in a moment.",
    });

    return;
  }

  app(req, res);
}

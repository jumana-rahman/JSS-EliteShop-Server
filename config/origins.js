import "dotenv/config";

const configuredOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const developmentOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
];

export const allowedOrigins = [
  ...new Set(
    process.env.NODE_ENV === "production"
      ? configuredOrigins
      : [...configuredOrigins, ...developmentOrigins]
  ),
];

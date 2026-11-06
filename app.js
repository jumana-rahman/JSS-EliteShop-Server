import express from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { allowedOrigins } from "./config/origins.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import categoriesRouter from "./routes/categories.js";
import productsRouter from "./routes/products.js";
import cartRouter from "./routes/cart.js";
import wishlistRouter from "./routes/wishlist.js";
import adminRouter from "./routes/admin.js";
import uploadsRouter from "./routes/uploads.js";

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Better Auth handler must be mounted before express.json().
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.json({
    message: "JSS EliteShop backend is running!",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Backend is working",
  });
});

app.use("/api/categories", categoriesRouter);
app.use("/api/products", productsRouter);
app.use("/api/cart", cartRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/admin", adminRouter);
app.use("/api/uploads", uploadsRouter);

app.use(notFound);
app.use(errorHandler);

export default app;

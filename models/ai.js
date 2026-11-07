import { ApiError } from "../utils/ApiError.js";
import { generateContent } from "../lib/gemini.js";
import {
  listProducts,
  findProductsByIds,
  findRelatedProducts,
} from "./product.js";
import { listCategories } from "./category.js";

const STORE_INFO = `JSS EliteShop is an online store selling electronics, fashion, home & living, kids, beauty & personal care, sports & fitness, and books & stationery.
Policies:
- Delivery: 3-5 business days standard. Express shipping (1-2 days) is available at checkout.
- Returns: 30-day hassle-free returns on most items; refunds are processed after the item is received.
- Payment: Cash on Delivery (COD). No card is charged online.
- Order tracking: customers can see live status under My Account -> Orders, including an invoice download.
- Contact support: support@jsseliteshop.com.
- All prices are in USD.`;

const VALID_SORTS = new Set([
  "popular",
  "newest",
  "price-low",
  "price-high",
  "rating",
  "discount",
]);

function productLine(product) {
  const description = (product.description || "").replace(/\s+/g, " ").slice(0, 140);
  return `- id=${product.id} | ${product.name} | category=${product.category}${
    product.subcategory ? ` / ${product.subcategory}` : ""
  } | brand=${product.brand || "n/a"} | price=$${product.price} | stock=${product.stockCount} | ${description}`;
}

function catalogText(products) {
  if (!products.length) return "The catalog is currently empty.";
  return products.map(productLine).join("\n");
}

async function loadCatalog(limit = 60) {
  const data = await listProducts({ limit, sort: "popular" });
  return data.products || [];
}

function parseJson(text) {
  if (!text) return null;

  const cleaned = String(text)
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function sanitizeReply(value, fallback) {
  const reply = typeof value === "string" ? value.trim() : "";
  return reply || fallback;
}

function pickProductList(ids, productMap, limit = 4) {
  if (!Array.isArray(ids)) return [];

  return [
    ...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)),
  ]
    .map((id) => productMap.get(id))
    .filter(Boolean)
    .slice(0, limit);
}

async function productsFromIds(ids, limit = 4) {
  const cleanIds = Array.isArray(ids)
    ? ids.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  if (!cleanIds.length) return [];

  const productMap = await findProductsByIds(cleanIds);
  return pickProductList(cleanIds, productMap, limit);
}

function toGeminiContents(messages) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

export async function chatWithAssistant({ messages, productId = "" }) {
  const catalog = await loadCatalog();
  const productMap = new Map(catalog.map((product) => [product.id, product]));
  const currentProduct = productId ? productMap.get(String(productId)) : null;
  const latestMessage = messages[messages.length - 1]?.content || "";

  const systemInstruction = `You are the JSS AI Shopping Assistant for JSS EliteShop.
${STORE_INFO}

You handle four modes: product search, outfit/bundle styling, complementary product suggestions, and customer support.
Always be concise (max 120 words) and helpful. Never invent products, prices or policies.
When recommending products, use ONLY the ids from the catalog below (max 4). If nothing fits, return an empty productIds array and explain what is unavailable.

Reply as strict JSON with this shape:
{"reply": "customer-facing answer, markdown bold allowed", "productIds": ["catalog-id", "catalog-id"]}

${currentProduct ? `The customer is currently viewing: id=${currentProduct.id} | ${currentProduct.name} | $${currentProduct.price} | ${currentProduct.category}` : ""}

Catalog:
${catalogText(catalog)}`;

  let result;

  try {
    result = await generateContent(
      {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: toGeminiContents(messages),
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      },
      { timeoutMs: 30000 }
    );
  } catch (error) {
    if (error?.status === 503 || error?.status === 0) {
      return assistantFallback(latestMessage);
    }
    throw error;
  }

  const parsed = parseJson(result.text);

  if (!parsed) {
    return {
      reply: sanitizeReply(result.text, "I'm here to help you shop smarter."),
      products: [],
      model: result.model,
    };
  }

  return {
    reply: sanitizeReply(
      parsed.reply,
      "I'm here to help you shop smarter. Ask me about products, outfits or your order."
    ),
    products: pickProductList(parsed.productIds, productMap, 4),
    model: result.model,
  };
}

async function assistantFallback(message) {
  const data = await listProducts({ search: message, limit: 4 }).catch(() => ({
    products: [],
  }));

  return {
    reply:
      "I'm having trouble reaching the AI service right now. You can still browse the catalog or try again in a moment.",
    products: data.products || [],
    model: null,
    degraded: true,
  };
}

function keywordVariants(keywords) {
  const values = new Set();
  const value = String(keywords || "").trim();
  const add = (term) => {
    const trimmed = String(term || "").trim();
    if (trimmed.length >= 2) values.add(trimmed);
  };

  add(value);

  for (const token of value.split(/\s+/).filter(Boolean)) {
    add(token);
    if (token.endsWith("ies")) add(`${token.slice(0, -3)}y`);
    if (token.endsWith("es")) add(token.slice(0, -2));
    if (token.endsWith("s")) add(token.slice(0, -1));
  }

  return [...values];
}

export async function searchProducts(query) {
  const [catalog, categories] = await Promise.all([
    loadCatalog(60),
    listCategories(),
  ]);

  const categoryText = categories
    .map((category) => `${category.name} (slug: ${category.slug})`)
    .join(", ");

  const systemInstruction = `You convert a shopper's natural-language request into catalog search filters for JSS EliteShop.
${STORE_INFO}

Available categories: ${categoryText || "none"}.

Reply as strict JSON:
{"keywords": "short product keywords, or empty string", "categorySlug": "one listed slug or empty string", "minPrice": number or null, "maxPrice": number or null, "inStockOnly": boolean, "sort": "popular" | "newest" | "price-low" | "price-high" | "rating" | "discount", "reply": "one short sentence describing what you found, markdown bold allowed"}

Rules:
- Prices are in USD. Convert any budget the shopper mentions into minPrice/maxPrice.
- Prefer categorySlug when the request clearly matches a category.
- Keep keywords specific and short; never invent brands or products.
- Choose "popular" unless the request implies another sort.`;

  const fallbackFilters = {
    keywords: query,
    categorySlug: "",
    minPrice: null,
    maxPrice: null,
    inStockOnly: false,
    sort: "popular",
    reply: `Here are products matching "${query}".`,
  };

  let filters = fallbackFilters;
  let model = null;
  let degraded = false;

  try {
    const result = await generateContent(
      {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          { role: "user", parts: [{ text: `Shopper request: ${query}` }] },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      },
      { timeoutMs: 30000 }
    );

    model = result.model;
    const parsed = parseJson(result.text);

    if (parsed) {
      const minPrice = Number(parsed.minPrice);
      const maxPrice = Number(parsed.maxPrice);

      filters = {
        keywords:
          typeof parsed.keywords === "string" && parsed.keywords.trim()
            ? parsed.keywords.trim()
            : query,
        categorySlug:
          typeof parsed.categorySlug === "string" ? parsed.categorySlug : "",
        minPrice: Number.isFinite(minPrice) && minPrice > 0 ? minPrice : null,
        maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : null,
        inStockOnly: Boolean(parsed.inStockOnly),
        sort: VALID_SORTS.has(parsed.sort) ? parsed.sort : "popular",
        reply: sanitizeReply(parsed.reply, fallbackFilters.reply),
      };
    }
  } catch {
    degraded = true;
  }

  const baseParams = {
    category: filters.categorySlug || undefined,
    minPrice: filters.minPrice ?? undefined,
    maxPrice: filters.maxPrice ?? undefined,
    inStock: filters.inStockOnly || undefined,
    sort: filters.sort,
    limit: 12,
  };

  const terms = keywordVariants(filters.keywords);
  if (!terms.length) terms.push("");

  let data = null;

  for (const term of terms) {
    const attempt = await listProducts({ ...baseParams, search: term });
    if (!data) data = attempt;
    if ((attempt.total || 0) > 0) {
      data = attempt;
      break;
    }
  }

  if ((data?.total || 0) === 0 && filters.categorySlug) {
    const relaxed = await listProducts({ ...baseParams, search: undefined });
    if ((relaxed.total || 0) > 0) data = relaxed;
  }

  return {
    reply: filters.reply,
    filters: {
      keywords: filters.keywords,
      categorySlug: filters.categorySlug,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      inStockOnly: filters.inStockOnly,
      sort: filters.sort,
    },
    products: data.products || [],
    total: data.total || 0,
    model,
    degraded,
  };
}

export async function completeLook(productId) {
  const productMap = await findProductsByIds([productId]);
  const product = productMap.get(String(productId));

  if (!product) throw new ApiError(404, "Product not found.");

  const catalog = (await loadCatalog(60)).filter(
    (item) => item.id !== product.id
  );
  const catalogMap = new Map(catalog.map((item) => [item.id, item]));

  const systemInstruction = `You are a personal stylist for JSS EliteShop. The customer is viewing:
id=${product.id} | ${product.name} | ${product.category}${product.subcategory ? ` / ${product.subcategory}` : ""} | $${product.price}

Suggest 2-4 complementary products from the catalog only (never the product itself). Focus on items that complete the look or bundle, and respect the customer's apparent budget.
${STORE_INFO}

Reply as strict JSON:
{"reply": "one short styling sentence", "productIds": ["catalog-id"]}

Catalog:
${catalogText(catalog)}`;

  try {
    const result = await generateContent(
      {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            role: "user",
            parts: [{ text: "Complete my look with matching items." }],
          },
        ],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      },
      { timeoutMs: 30000 }
    );

    const parsed = parseJson(result.text);
    const products = parsed
      ? pickProductList(parsed.productIds, catalogMap, 4)
      : [];

    if (products.length) {
      return {
        reply: sanitizeReply(
          parsed?.reply,
          "Here are a few pieces that pair well with your selection."
        ),
        products,
        model: result.model,
      };
    }
  } catch (error) {
    if (!(error?.status === 503 || error?.status === 0)) throw error;
  }

  const related = await findRelatedProducts(product.id, 4);

  return {
    reply: related.length
      ? "Here are a few pieces from the same collection that pair well with your selection."
      : "I could not find complementary items for this product right now.",
    products: related,
    model: null,
    degraded: true,
  };
}

import { ApiError } from "../utils/ApiError.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_PRIMARY_MODEL = "gemini-3.8-flash";
const DEFAULT_FALLBACK_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Statuses where trying another model can actually help. Everything else
 * (bad request, invalid key, permission) will fail the same way on any model.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 503, 504]);

export function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.has(Number(status));
}

function modelNames() {
  return {
    primary: process.env.GEMINI_MODEL_PRIMARY || DEFAULT_PRIMARY_MODEL,
    fallback: process.env.GEMINI_MODEL_FALLBACK || DEFAULT_FALLBACK_MODEL,
  };
}

function apiKey() {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new ApiError(500, "AI is not configured.");
  }

  return key;
}

function normalizePayload(payload) {
  if (typeof payload === "string") {
    return {
      contents: [{ role: "user", parts: [{ text: payload }] }],
    };
  }

  return payload;
}

function timeoutMs(options) {
  const value = Number(options.timeoutMs ?? process.env.GEMINI_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function buildSignal(signal, ms) {
  const timeout = AbortSignal.timeout(ms);

  if (!signal) return timeout;

  return typeof AbortSignal.any === "function"
    ? AbortSignal.any([signal, timeout])
    : timeout;
}

function extractText(data) {
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new ApiError(
      422,
      "The AI could not answer that request. Please rephrase it and try again."
    );
  }

  const candidate = data?.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts
    : [];
  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) {
    const finishReason = candidate?.finishReason;
    const error = new ApiError(
      502,
      "The AI returned an empty response. Please try again."
    );
    error.finishReason = finishReason;
    throw error;
  }

  return text;
}

async function readErrorMessage(response) {
  try {
    const data = await response.json();
    return typeof data?.error?.message === "string"
      ? data.error.message.slice(0, 300)
      : "";
  } catch {
    return "";
  }
}

async function callModel(model, payload, options) {
  const key = apiKey();
  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(payload),
      signal: buildSignal(options.signal, timeoutMs(options)),
    });
  } catch (cause) {
    const timedOut =
      cause?.name === "TimeoutError" || cause?.name === "AbortError";
    const error = new Error(
      timedOut ? "The AI request timed out." : "Could not reach the AI service."
    );
    error.name = "GeminiRequestError";
    error.status = 0;
    error.retryable = true;
    error.model = model;
    error.cause = cause;
    throw error;
  }

  if (!response.ok) {
    const upstreamMessage = await readErrorMessage(response);
    const error = new Error("The AI service rejected the request.");
    error.name = "GeminiRequestError";
    error.status = response.status;
    error.retryable = isRetryableStatus(response.status);
    error.model = model;
    error.upstreamMessage = upstreamMessage;
    throw error;
  }

  let data;

  try {
    data = await response.json();
  } catch (cause) {
    const error = new Error("The AI returned an invalid response.");
    error.name = "GeminiRequestError";
    error.status = 502;
    error.retryable = true;
    error.model = model;
    error.cause = cause;
    throw error;
  }

  return {
    text: extractText(data),
    model,
    usage: data?.usageMetadata || null,
    raw: data,
  };
}

function toPublicError(error) {
  if (error instanceof ApiError) return error;

  // Never forward the upstream message: it can include request details.
  switch (Number(error?.status)) {
    case 400:
    case 415:
      return new ApiError(
        502,
        "The AI could not understand that request. Please try again."
      );
    case 401:
    case 403:
      return new ApiError(500, "AI is not configured correctly.");
    default:
      return new ApiError(
        503,
        "AI is temporarily unavailable. Please try again in a moment."
      );
  }
}

/**
 * Send a request to Gemini, trying the primary model first and falling back
 * only for rate limits, overload and temporary server errors.
 *
 * @param {object|string} payload Gemini request body or a plain text prompt.
 * @param {object} [options] `signal`, `timeoutMs`.
 * @returns {Promise<{text: string, model: string, usage: object|null, raw: object}>}
 */
export async function generateContent(payload, options = {}) {
  const { primary, fallback } = modelNames();
  const attempts = primary === fallback ? [primary] : [primary, fallback];
  const request = normalizePayload(payload);

  let lastError;

  for (let index = 0; index < attempts.length; index += 1) {
    const model = attempts[index];

    try {
      return await callModel(model, request, options);
    } catch (error) {
      lastError = error;

      const hasFallback = index < attempts.length - 1;

      if (!error?.retryable || !hasFallback) break;

      console.warn(
        `[gemini] ${model} unavailable (${error.status || "timeout"}), retrying with ${attempts[index + 1]}`
      );
    }
  }

  throw toPublicError(lastError);
}

/**
 * Convenience wrapper for plain text prompts.
 */
export async function generateText(prompt, options = {}) {
  return generateContent(prompt, options);
}

import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

export const aiChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z
          .string({ error: "A message is required." })
          .trim()
          .min(1, "A message cannot be empty.")
          .max(1200, "That message is too long."),
      })
    )
    .min(1, "Send a message to the assistant.")
    .max(20, "This conversation is getting long. Start a new chat."),
  productId: objectId.optional(),
});

export const aiSearchSchema = z.object({
  query: z
    .string({ error: "Tell the assistant what you are looking for." })
    .trim()
    .min(2, "Please describe what you are looking for.")
    .max(300, "That search is too long."),
});

export const aiCompleteLookSchema = z.object({
  productId: objectId,
});

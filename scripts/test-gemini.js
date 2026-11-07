import "dotenv/config";
import { generateText } from "../lib/gemini.js";

const prompt =
  process.argv.slice(2).join(" ") ||
  "Reply with one short sentence confirming the assistant is online.";

try {
  const result = await generateText(prompt, {
    generationConfig: { temperature: 0.2, maxOutputTokens: 96 },
  });

  console.log(`model: ${result.model}`);
  console.log(`text: ${result.text}`);
} catch (error) {
  console.error(`failed: ${error.status || 0} ${error.message}`);
  process.exitCode = 1;
}

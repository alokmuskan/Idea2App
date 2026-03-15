// Non-streaming fallback for when streaming fails mid-flight.
import { completeText, resolveModel } from "./providers.js";

// Returns the full response text in one call.
export async function runNonStreaming({
  provider,
  model,
  messages,
  system,
  temperature,
  maxTokens,
}) {
  const providerId = provider || "groq";
  const resolvedModel = resolveModel(providerId, model, "main");
  return completeText({
    provider: providerId,
    model: resolvedModel,
    messages,
    system,
    temperature,
    maxTokens,
  });
}

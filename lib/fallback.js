import { completeText, resolveModel } from "./providers.js";

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

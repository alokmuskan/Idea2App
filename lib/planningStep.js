// Planning step to produce a <plan> block before generation.
import { completeText, resolveModel } from "./providers.js";

// Extract a <plan> block or wrap raw text into one.
function extractPlan(text) {
  if (!text) return "";
  const match = text.match(/<plan>[\s\S]*?<\/plan>/i);
  if (match) return match[0];
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `<plan>\n${trimmed}\n</plan>`;
}

// Pull the most recent user message for planning context.
function lastUserMessage(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === "user" && typeof msg.content === "string") return msg.content;
  }
  return "";
}

// Runs a fast planning model with provider fallback if needed.
export async function runPlanningStep({
  messages,
  projectState,
  provider,
  model,
  temperature = 0.2,
}) {
  const baseProvider = provider || "groq";
  const plannerOverride = process.env.PLANNER_MODEL || null;
  const preferredProviders = [];
  if (process.env.PLANNER_PROVIDER) {
    preferredProviders.push(process.env.PLANNER_PROVIDER);
  } else {
    if (process.env.OPENAI_API_KEY) preferredProviders.push("openai");
    if (baseProvider !== "openai") preferredProviders.push(baseProvider);
  }

  const userMessage = lastUserMessage(messages);

  const system =
    "You are a planning assistant for an AI app builder. " +
    "Output ONLY a <plan> block with a short ordered list of tasks. " +
    "No commentary, no extra tags.";

  const prompt =
    "Create a concise implementation plan for the request.\n\n" +
    `Project State JSON:\n${JSON.stringify(projectState || {})}\n\n` +
    `User Request:\n${userMessage}\n\n` +
    "Return only a <plan> block with 3-7 steps.";

  let output = "";
  for (const providerId of preferredProviders) {
    const fastModel = resolveModel(providerId, plannerOverride || model, "fast");
    const mainModel = resolveModel(providerId, plannerOverride || model, "main");
    try {
      output = await completeText({
        provider: providerId,
        model: fastModel,
        messages: [{ role: "user", content: prompt }],
        system,
        temperature,
        maxTokens: 256,
      });
    } catch {
      output = "";
    }

    if (!output) {
      try {
        output = await completeText({
          provider: providerId,
          model: mainModel,
          messages: [{ role: "user", content: prompt }],
          system,
          temperature,
          maxTokens: 256,
        });
      } catch {
        output = "";
      }
    }

    if (output) break;
  }

  return extractPlan(output);
}

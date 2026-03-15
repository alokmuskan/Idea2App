import { completeText, resolveModel } from "./providers.js";

function extractPlan(text) {
  if (!text) return "";
  const match = text.match(/<plan>[\s\S]*?<\/plan>/i);
  if (match) return match[0];
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `<plan>\n${trimmed}\n</plan>`;
}

function lastUserMessage(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === "user" && typeof msg.content === "string") return msg.content;
  }
  return "";
}

export async function runPlanningStep({
  messages,
  projectState,
  provider,
  model,
  temperature = 0.2,
}) {
  const plannerProvider = process.env.PLANNER_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : provider || "groq");
  const plannerModel = resolveModel(plannerProvider, model, "fast");
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

  const output = await completeText({
    provider: plannerProvider,
    model: plannerModel,
    messages: [{ role: "user", content: prompt }],
    system,
    temperature,
    maxTokens: 256,
  });

  return extractPlan(output);
}

import { completeText, resolveModel } from "./providers.js";

const VALID_INTENTS = new Set(["create", "refine", "debug", "explain"]);

function lastUserMessage(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === "user" && typeof msg.content === "string") return msg.content;
  }
  return "";
}

function hasProjectState(projectState) {
  if (!projectState || typeof projectState !== "object") return false;
  const keys = ["routes", "components", "dependencies", "recentFiles"];
  return keys.some((k) => Array.isArray(projectState[k]) && projectState[k].length > 0);
}

export function heuristicIntent({ messages, projectState }) {
  const text = lastUserMessage(messages).toLowerCase();
  if (!text) return "create";

  if (/(error|exception|stack trace|crash|bug|fix)/.test(text)) return "debug";
  if (/(explain|describe|how does|what does|why does)/.test(text)) return "explain";

  const hasState = hasProjectState(projectState);
  if (hasState && /(change|update|modify|add|remove|refine|tweak|improve|adjust)/.test(text)) {
    return "refine";
  }

  return "create";
}

export async function classifyIntent({
  messages,
  projectState,
  provider,
  model,
  temperature = 0,
}) {
  const classifierProvider = process.env.CLASSIFIER_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : provider || "groq");
  const classifierModel = resolveModel(classifierProvider, model, "fast");
  const userMessage = lastUserMessage(messages);

  const system =
    "You are an intent classifier for an AI app builder. " +
    "Return exactly one word from: create, refine, debug, explain. " +
    "No punctuation or extra text.";

  const context = {
    projectState: projectState || {},
    message: userMessage,
  };

  const prompt =
    "Classify the user intent based on the latest message and project state.\n\n" +
    `Project State JSON:\n${JSON.stringify(context.projectState)}\n\n` +
    `User Message:\n${context.message}\n\n` +
    "Return only one word: create, refine, debug, or explain.";

  try {
    const output = await completeText({
      provider: classifierProvider,
      model: classifierModel,
      messages: [{ role: "user", content: prompt }],
      system,
      temperature,
      maxTokens: 32,
    });
    const normalized = String(output || "").trim().toLowerCase();
    if (VALID_INTENTS.has(normalized)) return normalized;
  } catch {
    // Fall through to heuristic.
  }

  return heuristicIntent({ messages, projectState });
}

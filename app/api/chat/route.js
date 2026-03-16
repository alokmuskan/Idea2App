// Main AI orchestration endpoint:
// - classify intent
// - optionally plan
// - stream generator output as SSE
import { SYSTEM_PROMPT } from "../../../lib/systemPrompt.js";
import { classifyIntent } from "../../../lib/intentClassifier.js";
import { runPlanningStep } from "../../../lib/planningStep.js";
import { streamText } from "../../../lib/providers.js";
import { runNonStreaming } from "../../../lib/fallback.js";
import { fireAndForget, insertPrompt } from "../../../lib/supabase.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Add a lightweight mode directive to steer the generator.
function getIntentDirective(intent) {
  switch (intent) {
    case "refine":
      return "MODE: REFINE. Output only changed files (diff-only). Do not recreate unchanged files.";
    case "debug":
      return "MODE: DEBUG. Output only a <fix> block with minimal changes to resolve the error.";
    case "explain":
      return "MODE: EXPLAIN. Output a single <explain> block. Do not output <project>, <file>, or <fix> tags.";
    case "create":
    default:
      return "MODE: CREATE. Produce a complete initial build with required files.";
  }
}

// Combine the locked system prompt, mode directive, and project state JSON.
function buildSystemContext(systemPrompt, projectState, intent) {
  const state = projectState && typeof projectState === "object" ? projectState : {};
  const intentLine = getIntentDirective(intent);
  return `${systemPrompt}\n\n${intentLine}\n\nPROJECT STATE JSON:\n${JSON.stringify(state, null, 2)}`;
}

// Ensure only user/assistant messages are sent to providers.
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && typeof m.content === "string")
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));
}

// Used for prompt history persistence.
function getLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return messages[i].content;
  }
  return "";
}

// SSE response headers (no buffering).
function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

// Send a data-only SSE event (one message per chunk, encoded to preserve whitespace).
function enqueueSSE(controller, encoder, text) {
  if (!text) return;
  // Base64-encode the chunk so newlines and leading spaces inside code are preserved.
  // The consumer must decode accordingly.
  const encoded = Buffer.from(text).toString("base64");
  controller.enqueue(encoder.encode(`data: ${encoded}\n\n`));
}

// Send a named SSE event (used for errors).
function enqueueEvent(controller, encoder, event, data) {
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  const lines = String(data).split(/\r?\n/);
  for (const line of lines) {
    controller.enqueue(encoder.encode(`data: ${line}\n`));
  }
  controller.enqueue(encoder.encode("\n"));
}

// POST /api/chat
// Body: { messages, provider, model, projectState, stream, ... }
export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawMessages = body.messages || [];
  const messages = sanitizeMessages(rawMessages);
  if (!messages.length) {
    return Response.json({ error: "messages is required" }, { status: 400 });
  }

  const provider = body.provider || "groq";
  const model = body.model || null;
  const temperature = body.temperature;
  const maxTokens = body.maxTokens;
  const projectState = body.projectState || {};
  const systemPrompt = body.systemPrompt || SYSTEM_PROMPT;
  const stream = body.stream !== false;

  const projectId = body.projectId || null;
  const lastUser = getLastUserMessage(messages);
  if (projectId && lastUser) {
    fireAndForget(() => insertPrompt({ projectId, role: "user", message: lastUser }));
  }

  const intent = body.intent || (await classifyIntent({ messages, projectState, provider }));
  const system = buildSystemContext(systemPrompt, projectState, intent);

  let plan = "";
  // Planning step is only useful for create/refine flows.
  if (intent === "create" || intent === "refine") {
    try {
      plan = await runPlanningStep({
        messages,
        projectState,
        provider,
      });
    } catch {
      plan = "";
    }
  }

  // Non-streaming fallback returns JSON for easier debugging.
  if (!stream) {
    const content = await runNonStreaming({
      provider,
      model,
      messages,
      system,
      temperature,
      maxTokens,
    });
    return Response.json({ intent, plan, content });
  }

  const encoder = new TextEncoder();

  // Streaming mode: emit <plan> first, then the generator stream.
  const responseStream = new ReadableStream({
    async start(controller) {
      try {
        if (plan) enqueueSSE(controller, encoder, plan);
        for await (const chunk of streamText({
          provider,
          model,
          messages,
          system,
          temperature,
          maxTokens,
        })) {
          if (chunk) enqueueSSE(controller, encoder, chunk);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "stream_error";
        enqueueEvent(controller, encoder, "error", JSON.stringify({ message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseStream, { headers: sseHeaders() });
}

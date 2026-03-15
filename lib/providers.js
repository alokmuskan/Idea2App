const PROVIDERS = {
  groq: {
    id: "groq",
    type: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    defaultModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    fastModel: process.env.GROQ_FAST_MODEL || "llama-3.1-8b-instant",
  },
  openai: {
    id: "openai",
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: process.env.OPENAI_MODEL || "gpt-4o",
    fastModel: process.env.OPENAI_FAST_MODEL || "gpt-4o-mini",
  },
  anthropic: {
    id: "anthropic",
    type: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    defaultModel: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    fastModel: process.env.ANTHROPIC_FAST_MODEL || "claude-3-5-haiku-20241022",
  },
  gemini: {
    id: "gemini",
    type: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnv: "GEMINI_API_KEY",
    defaultModel: process.env.GEMINI_MODEL || "gemini-1.5-pro",
    fastModel: process.env.GEMINI_FAST_MODEL || "gemini-1.5-flash",
  },
};

const DEFAULT_TIMEOUT_MS = 120000;

export function getProviderConfig(providerId) {
  const key = (providerId || "").toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }
  return provider;
}

export function resolveModel(providerId, requested, kind = "main") {
  if (requested) return requested;
  const provider = getProviderConfig(providerId);
  if (kind === "fast") return provider.fastModel || provider.defaultModel;
  return provider.defaultModel;
}

export function getApiKey(providerId) {
  const provider = getProviderConfig(providerId);
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing API key for ${provider.id}. Set ${provider.apiKeyEnv}.`);
  }
  return apiKey;
}

function buildOpenAIMessages({ system, messages }) {
  const cleaned = Array.isArray(messages) ? messages.filter(Boolean) : [];
  const filtered = cleaned.filter((m) => m.role === "user" || m.role === "assistant");
  if (system) {
    return [{ role: "system", content: system }, ...filtered];
  }
  return filtered;
}

function buildAnthropicMessages({ messages }) {
  const cleaned = Array.isArray(messages) ? messages.filter(Boolean) : [];
  return cleaned
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: [{ type: "text", text: String(m.content || "") }],
    }));
}

function buildGeminiContents({ system, messages }) {
  const cleaned = Array.isArray(messages) ? messages.filter(Boolean) : [];
  const contents = [];
  if (system) {
    contents.push({
      role: "user",
      parts: [{ text: `SYSTEM:\n${system}` }],
    });
  }
  for (const m of cleaned) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }],
    });
  }
  return contents;
}

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return { signal: controller.signal, cleanup: () => clearTimeout(timeout) };
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let errorBody = "";
    try {
      errorBody = JSON.stringify(await res.json());
    } catch {
      errorBody = await res.text();
    }
    throw new Error(`Provider request failed (${res.status}): ${errorBody}`);
  }
  return res.json();
}

function parseSSEEvent(raw) {
  const lines = raw.split(/\r?\n/);
  let event = "";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      const value = line.slice(5).replace(/^\s?/, "");
      data += value + "\n";
    }
  }
  if (data.endsWith("\n")) data = data.slice(0, -1);
  if (!event && !data) return null;
  return { event, data };
}

async function* iterateSSE(response) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx === -1) break;
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseSSEEvent(rawEvent);
      if (parsed) yield parsed;
    }
  }
  if (buffer.trim().length > 0) {
    const parsed = parseSSEEvent(buffer);
    if (parsed) yield parsed;
  }
}

function extractOpenAIDelta(eventData) {
  if (eventData === "[DONE]") return null;
  const payload = JSON.parse(eventData);
  const delta = payload.choices?.[0]?.delta?.content;
  if (typeof delta === "string") return delta;
  return "";
}

function extractOpenAIContent(payload) {
  const content = payload.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

function extractAnthropicDelta(payload) {
  if (payload.type === "content_block_delta") {
    const text = payload.delta?.text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function extractAnthropicContent(payload) {
  const parts = Array.isArray(payload.content) ? payload.content : [];
  return parts.map((p) => p.text || "").join("");
}

function extractGeminiDelta(payload) {
  const parts = payload.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

function extractGeminiContent(payload) {
  const parts = payload.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

async function* streamOpenAICompatible({
  providerId,
  model,
  messages,
  system,
  temperature,
  maxTokens,
}) {
  const provider = getProviderConfig(providerId);
  const apiKey = getApiKey(providerId);
  const url = `${provider.baseUrl}/chat/completions`;
  const payload = {
    model,
    messages: buildOpenAIMessages({ system, messages }),
    stream: true,
  };
  if (typeof temperature === "number") payload.temperature = temperature;
  if (typeof maxTokens === "number") payload.max_tokens = maxTokens;

  const { signal, cleanup } = withTimeout();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = JSON.stringify(await response.json());
      } catch {
        errorBody = await response.text();
      }
      throw new Error(`Provider stream failed (${response.status}): ${errorBody}`);
    }
    for await (const evt of iterateSSE(response)) {
      if (!evt?.data) continue;
      const delta = extractOpenAIDelta(evt.data);
      if (delta === null) break;
      if (delta) yield delta;
    }
  } finally {
    cleanup();
  }
}

async function completeOpenAICompatible({
  providerId,
  model,
  messages,
  system,
  temperature,
  maxTokens,
}) {
  const provider = getProviderConfig(providerId);
  const apiKey = getApiKey(providerId);
  const url = `${provider.baseUrl}/chat/completions`;
  const payload = {
    model,
    messages: buildOpenAIMessages({ system, messages }),
  };
  if (typeof temperature === "number") payload.temperature = temperature;
  if (typeof maxTokens === "number") payload.max_tokens = maxTokens;

  const { signal, cleanup } = withTimeout();
  try {
    const res = await fetchJson(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
    return extractOpenAIContent(res);
  } finally {
    cleanup();
  }
}

async function* streamAnthropic({
  model,
  messages,
  system,
  temperature,
  maxTokens,
}) {
  const apiKey = getApiKey("anthropic");
  const url = "https://api.anthropic.com/v1/messages";
  const payload = {
    model,
    messages: buildAnthropicMessages({ messages }),
    stream: true,
    max_tokens: typeof maxTokens === "number" ? maxTokens : 1024,
  };
  if (system) payload.system = system;
  if (typeof temperature === "number") payload.temperature = temperature;

  const { signal, cleanup } = withTimeout();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = JSON.stringify(await response.json());
      } catch {
        errorBody = await response.text();
      }
      throw new Error(`Anthropic stream failed (${response.status}): ${errorBody}`);
    }
    for await (const evt of iterateSSE(response)) {
      if (!evt?.data) continue;
      const payload = JSON.parse(evt.data);
      const delta = extractAnthropicDelta(payload);
      if (delta) yield delta;
    }
  } finally {
    cleanup();
  }
}

async function completeAnthropic({
  model,
  messages,
  system,
  temperature,
  maxTokens,
}) {
  const apiKey = getApiKey("anthropic");
  const url = "https://api.anthropic.com/v1/messages";
  const payload = {
    model,
    messages: buildAnthropicMessages({ messages }),
    max_tokens: typeof maxTokens === "number" ? maxTokens : 1024,
  };
  if (system) payload.system = system;
  if (typeof temperature === "number") payload.temperature = temperature;

  const { signal, cleanup } = withTimeout();
  try {
    const res = await fetchJson(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
    return extractAnthropicContent(res);
  } finally {
    cleanup();
  }
}

async function* streamGemini({
  model,
  messages,
  system,
  temperature,
  maxTokens,
}) {
  const apiKey = getApiKey("gemini");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  const payload = {
    contents: buildGeminiContents({ system, messages }),
  };
  if (typeof temperature === "number" || typeof maxTokens === "number") {
    payload.generationConfig = {};
    if (typeof temperature === "number") payload.generationConfig.temperature = temperature;
    if (typeof maxTokens === "number") payload.generationConfig.maxOutputTokens = maxTokens;
  }

  const { signal, cleanup } = withTimeout();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = JSON.stringify(await response.json());
      } catch {
        errorBody = await response.text();
      }
      throw new Error(`Gemini stream failed (${response.status}): ${errorBody}`);
    }
    for await (const evt of iterateSSE(response)) {
      if (!evt?.data) continue;
      const payload = JSON.parse(evt.data);
      const delta = extractGeminiDelta(payload);
      if (delta) yield delta;
    }
  } finally {
    cleanup();
  }
}

async function completeGemini({
  model,
  messages,
  system,
  temperature,
  maxTokens,
}) {
  const apiKey = getApiKey("gemini");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const payload = {
    contents: buildGeminiContents({ system, messages }),
  };
  if (typeof temperature === "number" || typeof maxTokens === "number") {
    payload.generationConfig = {};
    if (typeof temperature === "number") payload.generationConfig.temperature = temperature;
    if (typeof maxTokens === "number") payload.generationConfig.maxOutputTokens = maxTokens;
  }

  const { signal, cleanup } = withTimeout();
  try {
    const res = await fetchJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal,
    });
    return extractGeminiContent(res);
  } finally {
    cleanup();
  }
}

export async function* streamText({
  provider,
  model,
  messages,
  system,
  temperature,
  maxTokens,
}) {
  const providerId = provider || "groq";
  const resolvedModel = resolveModel(providerId, model, "main");
  const config = getProviderConfig(providerId);

  if (config.type === "openai") {
    yield* streamOpenAICompatible({
      providerId,
      model: resolvedModel,
      messages,
      system,
      temperature,
      maxTokens,
    });
    return;
  }
  if (config.type === "anthropic") {
    yield* streamAnthropic({
      model: resolvedModel,
      messages,
      system,
      temperature,
      maxTokens,
    });
    return;
  }
  if (config.type === "gemini") {
    yield* streamGemini({
      model: resolvedModel,
      messages,
      system,
      temperature,
      maxTokens,
    });
    return;
  }

  throw new Error(`Streaming not supported for provider: ${providerId}`);
}

export async function completeText({
  provider,
  model,
  messages,
  system,
  temperature,
  maxTokens,
}) {
  const providerId = provider || "groq";
  const resolvedModel = resolveModel(providerId, model, "main");
  const config = getProviderConfig(providerId);

  if (config.type === "openai") {
    return completeOpenAICompatible({
      providerId,
      model: resolvedModel,
      messages,
      system,
      temperature,
      maxTokens,
    });
  }
  if (config.type === "anthropic") {
    return completeAnthropic({
      model: resolvedModel,
      messages,
      system,
      temperature,
      maxTokens,
    });
  }
  if (config.type === "gemini") {
    return completeGemini({
      model: resolvedModel,
      messages,
      system,
      temperature,
      maxTokens,
    });
  }

  throw new Error(`Completion not supported for provider: ${providerId}`);
}

import { consumeSSEStream } from "./consumeStream";

export async function runChatTurn({
  engine,
  endpoint = "/api/chat",
  payload,
  fetchImpl = fetch,
  onPlan,
  onFile,
  onShell,
}) {
  if (!engine) {
    throw new Error("runChatTurn requires an engine instance");
  }

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  const files = [];
  const shellCommands = [];
  const plans = [];

  await consumeSSEStream(response.body, {
    onPlan: async (event) => {
      plans.push(...event.tasks);
      if (typeof onPlan === "function") {
        await onPlan(event.tasks);
      }
    },
    onFile: async (event) => {
      files.push({ path: event.path, content: event.content });
      if (typeof onFile === "function") {
        await onFile(event);
      }
    },
    onShell: async (event) => {
      shellCommands.push(event.command);
      if (typeof onShell === "function") {
        await onShell(event);
      }
    },
  });

  if (files.length > 0) {
    await engine.writeFiles(files);
  }

  let shellResults = [];
  if (shellCommands.length > 0) {
    shellResults = await engine.runShell(shellCommands);
  }

  return {
    plans,
    filesWritten: files.length,
    shellCommands,
    shellResults,
    projectState: engine.getProjectState(),
  };
}
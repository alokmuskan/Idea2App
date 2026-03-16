import { consumeSSEStream } from "./consumeStream";
import { createStreamParser } from "./parser";

function parseOutputToEvents(text) {
  if (!text) return [];
  const parser = createStreamParser();
  const events = parser.push(text);
  return events.concat(parser.flush());
}

async function parseAndDispatch(text, handlers, accumulators) {
  const events = parseOutputToEvents(text);
  for (const event of events) {
    if (event.type === "plan") {
      accumulators.plans.push(...event.tasks);
      if (typeof handlers.onPlan === "function") {
        await handlers.onPlan(event.tasks);
      }
    }
    if (event.type === "file") {
      accumulators.files.push({ path: event.path, content: event.content });
      if (typeof handlers.onFile === "function") {
        await handlers.onFile(event);
      }
    }
    if (event.type === "shell") {
      accumulators.shellCommands.push(event.command);
      if (typeof handlers.onShell === "function") {
        await handlers.onShell(event);
      }
    }
  }
}

export async function runChatTurn({
  engine,
  endpoint = "/api/chat",
  payload,
  fetchImpl = fetch,
  onPlan,
  onFile,
  onShell,
  ensureDevServer = true,
  fallbackOnEmpty = true,
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

  const expectFiles =
    payload?.expectFiles === false ||
    payload?.intent === "explain"
      ? false
      : true;

  if (fallbackOnEmpty && expectFiles && files.length === 0) {
    const fallbackResponse = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stream: false }),
    });
    if (fallbackResponse.ok) {
      const data = await fallbackResponse.json();
      if (data?.plan) {
        await parseAndDispatch(data.plan, { onPlan, onFile, onShell }, { plans, files, shellCommands });
      }
      if (data?.content) {
        await parseAndDispatch(data.content, { onPlan, onFile, onShell }, { plans, files, shellCommands });
      }
    }
  }

  const normalizeCommand = (command) => String(command || "").trim().replace(/^[>$#]\s+/, "");
  const allowedCommand = (command) =>
    /^(npm|pnpm|yarn|npx|node|vite)\b/i.test(normalizeCommand(command));

  const safeShellCommands = shellCommands
    .map((command) => normalizeCommand(command))
    .filter((command) => command && allowedCommand(command));

  const installCommand = safeShellCommands.find((command) =>
    /\b(npm|pnpm|yarn)\s+(install|i)\b/i.test(command)
  );

  const devIndex = safeShellCommands.findIndex((command) =>
    /\b(npm\s+run\s+dev|pnpm\s+dev|yarn\s+dev|vite\s+--host)\b/i.test(command)
  );
  const devCommand = devIndex >= 0 ? safeShellCommands[devIndex] : null;

  const blockingCommands = safeShellCommands.filter((_, index) => index !== devIndex);
  const filteredBlocking =
    installCommand && blockingCommands.includes(installCommand)
      ? blockingCommands.filter((command) => command !== installCommand)
      : blockingCommands;

  if (files.length > 0) {
    await engine.writeFiles(files);
  }

  let shellResults = [];
  let installResult = null;
  if (typeof engine.ensureDependencies === "function") {
    if (installCommand) {
      installResult = await engine.ensureDependencies(installCommand);
    } else {
      installResult = await engine.ensureDependencies();
    }
  } else if (installCommand) {
    shellResults = await engine.runShell([installCommand]);
    installResult = shellResults?.[0] || null;
  }

  if (filteredBlocking.length > 0) {
    shellResults = await engine.runShell(filteredBlocking);
  }

  const installFailed =
    installResult &&
    typeof installResult.exitCode === "number" &&
    installResult.exitCode !== 0;
  const installSkipped = installResult?.skipped && installResult?.reason;

  if (!installFailed && !installSkipped) {
    if (devCommand && typeof engine.ensureDevServer === "function") {
      await engine.ensureDevServer(devCommand);
    } else if (ensureDevServer && typeof engine.ensureDevServer === "function") {
      await engine.ensureDevServer();
    }
  }

  return {
    plans,
    filesWritten: files.length,
    shellCommands: safeShellCommands,
    shellResults,
    projectState: engine.getProjectState(),
  };
}

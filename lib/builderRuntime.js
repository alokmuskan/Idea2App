import { createEngine } from "./engine.js";
import { runChatTurn } from "./chatOrchestrator.js";
import { BUILDER_EVENTS, emitBuilderEvent } from "./builderEvents.js";

let runtimePromise = null;

function extractFilesFromFix(text) {
  if (!text) return [];
  const files = [];
  const regex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/gi;
  let match;
  while ((match = regex.exec(text))) {
    files.push({ path: match[1], content: match[2] });
  }
  return files;
}

async function buildRuntime() {
  let engine;
  engine = createEngine({
    onServerReady({ url }) {
      emitBuilderEvent(BUILDER_EVENTS.PREVIEW_URL, { url });
    },
    requestFix: async ({ trace, command, projectState }) => {
      const prompt = `The app crashed.\nCommand: ${command || "unknown"}\n\nError trace:\n${trace}\n\nFix the issue. Output only a <fix> block with <file> tags.`;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "debug",
          stream: false,
          projectState,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const content = data.content || "";
      const files = extractFilesFromFix(content);
      if (files.length > 0) {
        await engine.writeFiles(files);
      }
      return { content, files };
    },
    onFixed() {
      emitBuilderEvent(BUILDER_EVENTS.ERROR, { fixed: true });
    },
  });

  engine.onFileWritten((path, content, state) => {
    emitBuilderEvent(BUILDER_EVENTS.FILE_WRITTEN, { path, content });
    if (state) emitBuilderEvent(BUILDER_EVENTS.PROJECT_STATE, state);
  });

  engine.onShellOutput((line) => {
    emitBuilderEvent(BUILDER_EVENTS.SHELL_OUTPUT, { line });
  });

  engine.onError((error) => {
    emitBuilderEvent(BUILDER_EVENTS.ERROR, { error: error?.message || "error" });
  });

  return {
    engine,
    async init() {
      await engine.initWebContainer();
      const restored = engine.restoreProjectState();
      if (restored) {
        emitBuilderEvent(BUILDER_EVENTS.PROJECT_STATE, restored);
      }
    },
    async runTurn(payload, handlers) {
      return runChatTurn({
        engine,
        payload,
        onPlan: handlers?.onPlan,
        onFile: handlers?.onFile,
        onShell: handlers?.onShell,
      });
    },
  };
}

export async function getBuilderRuntime() {
  if (!runtimePromise) {
    runtimePromise = buildRuntime();
  }
  return runtimePromise;
}

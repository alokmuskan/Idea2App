import { createStreamParser } from "./parser.js";
import { createEngine } from "./engine.js";
import { runChatTurn } from "./chatOrchestrator.js";
import { BUILDER_EVENTS, emitBuilderEvent } from "./builderEvents.js";

let runtimePromise = null;

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
      
      const parser = createStreamParser();
      const events = parser.push(content);
      const allEvents = events.concat(parser.flush());
      const files = allEvents.filter(e => e.type === "file");

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
      if (typeof window !== "undefined" && !window.crossOriginIsolated) {
        emitBuilderEvent(BUILDER_EVENTS.ERROR, {
          error:
            "WebContainers require crossOriginIsolated. Check COOP/COEP headers in next.config.js.",
        });
        return;
      }

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

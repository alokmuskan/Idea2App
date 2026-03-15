import { createStreamParser } from "./parser";

function extractSSEData(eventBlock) {
  return eventBlock
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

async function emitParsedEvents(events, handlers) {
  for (const event of events) {
    if (event.type === "file" && typeof handlers.onFile === "function") {
      await handlers.onFile(event);
    }
    if (event.type === "shell" && typeof handlers.onShell === "function") {
      await handlers.onShell(event);
    }
    if (event.type === "plan" && typeof handlers.onPlan === "function") {
      await handlers.onPlan(event);
    }
  }
}

export async function consumeSSEStream(readableStream, handlers = {}) {
  const parser = createStreamParser();
  const decoder = new TextDecoder();
  const reader = readableStream.getReader();
  let sseBuffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });

      let boundary = sseBuffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const eventBlock = sseBuffer.slice(0, boundary);
        const separatorLength = sseBuffer[boundary] === "\r" ? 4 : 2;
        sseBuffer = sseBuffer.slice(boundary + separatorLength);

        const payload = extractSSEData(eventBlock);
        if (payload && payload !== "[DONE]") {
          await emitParsedEvents(parser.push(payload), handlers);
        }

        boundary = sseBuffer.search(/\r?\n\r?\n/);
      }
    }

    if (sseBuffer.trim()) {
      const payload = extractSSEData(sseBuffer);
      if (payload && payload !== "[DONE]") {
        await emitParsedEvents(parser.push(payload), handlers);
      }
    }

    await emitParsedEvents(parser.flush(), handlers);
  } finally {
    reader.releaseLock();
  }
}
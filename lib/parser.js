function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tryExtractTag(buffer, tagName) {
  const startTag = `<${tagName}`;
  const endTag = `</${tagName}>`;

  const start = buffer.indexOf(startTag);
  if (start === -1) return null;

  const openTagEnd = buffer.indexOf(">", start);
  if (openTagEnd === -1) return null;

  const close = buffer.indexOf(endTag, openTagEnd + 1);
  if (close === -1) return null;

  return {
    tagName,
    start,
    end: close + endTag.length,
    openTag: buffer.slice(start, openTagEnd + 1),
    inner: buffer.slice(openTagEnd + 1, close),
  };
}

function parseFileBlock(openTag, content) {
  const pathMatch = openTag.match(/path=["']([^"']+)["']/);
  if (!pathMatch) return null;
  return {
    type: "file",
    path: pathMatch[1],
    content: decodeXmlEntities(content),
  };
}

function parseShellBlock(content) {
  const lines = decodeXmlEntities(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((command) => ({ type: "shell", command }));
}

function parsePlanBlock(content) {
  const tasks = decodeXmlEntities(content)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
    .filter(Boolean);
  return { type: "plan", tasks };
}

function parseTagBlock(tag) {
  if (tag.tagName === "file") return parseFileBlock(tag.openTag, tag.inner);
  if (tag.tagName === "plan") return parsePlanBlock(tag.inner);
  if (tag.tagName === "shell") return parseShellBlock(tag.inner);

  if (tag.tagName === "project" || tag.tagName === "fix") {
    const events = [{ type: tag.tagName, content: tag.inner }];
    // Recursively parse inner content to extract files and shell commands
    const innerParser = createStreamParser();
    const innerEvents = innerParser.push(tag.inner);
    return events.concat(innerEvents).concat(innerParser.flush());
  }

  if (tag.tagName === "explain") {
    return { type: "explain", content: decodeXmlEntities(tag.inner) };
  }

  return null;
}

export function createStreamParser() {
  let buffer = "";

  function push(chunk) {
    buffer += chunk;
    const events = [];

    while (buffer.length > 0) {
      const candidates = [
        tryExtractTag(buffer, "plan"),
        tryExtractTag(buffer, "file"),
        tryExtractTag(buffer, "shell"),
        tryExtractTag(buffer, "project"),
        tryExtractTag(buffer, "fix"),
        tryExtractTag(buffer, "explain"),
      ].filter(Boolean);

      if (!candidates.length) break;

      candidates.sort((a, b) => a.start - b.start);
      const nextTag = candidates[0];

      if (nextTag.start > 0) {
        buffer = buffer.slice(nextTag.start);
      }

      const parsed = parseTagBlock(nextTag);
      if (Array.isArray(parsed)) {
        events.push(...parsed);
      } else if (parsed) {
        events.push(parsed);
      }

      buffer = buffer.slice(nextTag.end);
    }

    return events;
  }

  function flush() {
    const finalEvents = push("");
    buffer = "";
    return finalEvents;
  }

  function getBuffer() {
    return buffer;
  }

  return {
    push,
    flush,
    getBuffer,
  };
}
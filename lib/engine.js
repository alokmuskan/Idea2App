import { createErrorRecovery } from "./errorRecovery";
import { createProjectState } from "./projectState";
import { createShellQueue } from "./shellQueue";
import {
  getWebContainer,
  initWebContainer as bootWebContainer,
  writeFiles as writeFilesToContainer,
} from "./webcontainer";

function createEventBus() {
  const listeners = {
    fileWritten: new Set(),
    shellOutput: new Set(),
    error: new Set(),
  };

  function emit(event, ...args) {
    for (const listener of listeners[event]) {
      listener(...args);
    }
  }

  function subscribe(event, callback) {
    listeners[event].add(callback);
    return () => listeners[event].delete(callback);
  }

  return {
    emit,
    onFileWritten: (cb) => subscribe("fileWritten", cb),
    onShellOutput: (cb) => subscribe("shellOutput", cb),
    onError: (cb) => subscribe("error", cb),
  };
}

function splitCommand(command) {
  const input = String(command || "").trim();
  if (!input) return [];

  const args = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const ch of input) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (ch === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (escaping) {
    current += "\\";
  }
  if (current) {
    args.push(current);
  }

  return args;
}

async function runContainerCommand(command, { onOutput } = {}) {
  const container = await getWebContainer();
  const [cmd, ...args] = splitCommand(command);
  const process = await container.spawn(cmd, args);

  let output = "";
  await process.output.pipeTo(
    new WritableStream({
      write(data) {
        const text = String(data);
        output += text;
        if (typeof onOutput === "function") {
          onOutput(text);
        }
      },
    })
  );

  const exitCode = await process.exit;
  return { command, exitCode, output };
}

async function startContainerCommand(command, { onOutput } = {}) {
  const container = await getWebContainer();
  const [cmd, ...args] = splitCommand(command);
  const process = await container.spawn(cmd, args);

  void process.output.pipeTo(
    new WritableStream({
      write(data) {
        if (typeof onOutput === "function") {
          onOutput(String(data));
        }
      },
    })
  );

  return { command, process };
}

async function runDryCommand(command, { onOutput } = {}) {
  const line = `[dry-run] ${command}`;
  if (typeof onOutput === "function") {
    onOutput(`${line}\n`);
  }
  return { command, exitCode: 0, output: line };
}

async function startDryCommand(command, { onOutput } = {}) {
  const line = `[dry-run-start] ${command}`;
  if (typeof onOutput === "function") {
    onOutput(`${line}\n`);
  }
  return {
    command,
    process: {
      kill() {
        return true;
      },
    },
  };
}

export function createEngine(options = {}) {
  const mode = options.mode || "webcontainer";
  const events = createEventBus();
  const projectState = createProjectState(options.initialState || {});

  const errorRecovery = createErrorRecovery({
    requestFix: options.requestFix,
    onFixed: options.onFixed,
    onFixFailed: (error) => events.emit("error", error),
  });

  function handleOutput(text) {
    events.emit("shellOutput", text);
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => errorRecovery.addOutputLine(line));
  }

  const runner = mode === "dry-run" ? runDryCommand : runContainerCommand;
  const starter = mode === "dry-run" ? startDryCommand : startContainerCommand;

  const shellQueue = createShellQueue(runner, {
    onOutput: handleOutput,
  });

  async function initWebContainer() {
    if (mode === "dry-run") {
      return { mode: "dry-run" };
    }

    return bootWebContainer({
      onServerReady: options.onServerReady,
    });
  }

  async function writeFiles(files) {
    if (mode === "dry-run") {
      for (const file of files) {
        const nextState = projectState.updateFromFile(file.path, file.content);
        projectState.saveToLocalStorage();
        events.emit("fileWritten", file.path, file.content, nextState);
      }
      return;
    }

    await writeFilesToContainer(files, {
      onFileWritten(path, content) {
        const nextState = projectState.updateFromFile(path, content);
        projectState.saveToLocalStorage();
        events.emit("fileWritten", path, content, nextState);
      },
    });
  }

  async function runShell(commands) {
    const result = await shellQueue.runMany(commands);
    const firstFailure = result.find((step) => step.exitCode !== 0);

    if (firstFailure) {
      const fix = await errorRecovery.tryAutoFix({
        command: firstFailure.command,
        projectState: projectState.getState(),
      });

      if (!fix.fixed) {
        events.emit("error", new Error(firstFailure.output || "Shell command failed"));
      }
    }

    return result;
  }

  async function startShell(command) {
    return starter(command, {
      onOutput: handleOutput,
    });
  }

  return {
    initWebContainer,
    writeFiles,
    runShell,
    startShell,
    getProjectState: projectState.getState,
    restoreProjectState: projectState.restoreFromLocalStorage,
    onFileWritten: events.onFileWritten,
    onShellOutput: events.onShellOutput,
    onError: events.onError,
    getMode: () => mode,
  };
}
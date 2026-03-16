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
  let devServerProcess = null;
  let dependenciesInstalled = false;

  function sanitizePackageJson(content) {
    if (!content || typeof content !== "string") return content;
    try {
      const pkg = JSON.parse(content);
      if (!pkg.scripts) pkg.scripts = {};
      if (!pkg.scripts.dev) {
        pkg.scripts.dev = "vite --host";
      } else if (typeof pkg.scripts.dev === "string") {
        pkg.scripts.dev = pkg.scripts.dev
          .replace(/vite--host/g, "vite --host")
          .replace(/\bvite\s+--host(?:\s+--host)+/g, "vite --host");
        if (pkg.scripts.dev.trim() === "vite") {
          pkg.scripts.dev = "vite --host";
        }
      }
      if (!pkg.devDependencies) pkg.devDependencies = {};
      const autoprefixer = pkg.devDependencies.autoprefixer;
      if (autoprefixer && /^(\^)?11(\.|$)/.test(String(autoprefixer))) {
        pkg.devDependencies.autoprefixer = "^10.4.20";
      }
      if (pkg.devDependencies.autoprefixer == null) {
        pkg.devDependencies.autoprefixer = "^10.4.20";
      }
      if (pkg.devDependencies.postcss == null) {
        pkg.devDependencies.postcss = "^8.4.45";
      }
      if (pkg.devDependencies.tailwindcss == null) {
        pkg.devDependencies.tailwindcss = "^3.4.10";
      }
      return JSON.stringify(pkg, null, 2);
    } catch {
      return content;
    }
  }

  function sanitizeViteConfig(content) {
    if (!content || typeof content !== "string") return content;
    let next = content;
    next = next.replace(/import\{/g, "import {");
    next = next.replace(/}\s*from/g, "} from");
    next = next.replace(/import([A-Za-z_$][\w$]*)from/g, "import $1 from");
    next = next.replace(/exportdefault/g, "export default");
    next = next.replace(/defaultdefineConfig/g, "default defineConfig");
    next = next.replace(/defineConfig\(/g, "defineConfig(");
    next = next.replace(/from'([^']+)'/g, "from '$1'");
    next = next.replace(/from\"([^\"]+)\"/g, 'from "$1"');
    return next;
  }

  function hasMalformedViteConfig(content) {
    return /importreactfrom|exportdefaultdefineConfig|defaultdefineConfig|defineConfig\(\{/i.test(
      content || ""
    );
  }

  function defaultViteConfig() {
    return (
      "import { defineConfig } from \"vite\";\n" +
      "import react from \"@vitejs/plugin-react\";\n\n" +
      "export default defineConfig({\n" +
      "  plugins: [react()],\n" +
      "});\n"
    );
  }

  async function readPackageJson() {
    if (mode === "dry-run") return null;
    try {
      const container = await getWebContainer();
      const raw = await container.fs.readFile("package.json", "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

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
        let content = file.content;
        if (file.path === "package.json") {
          content = sanitizePackageJson(content);
        } else if (file.path === "vite.config.js") {
          content = sanitizeViteConfig(content);
          if (hasMalformedViteConfig(content)) {
            content = defaultViteConfig();
          }
        }
        const nextState = projectState.updateFromFile(file.path, content);
        projectState.saveToLocalStorage();
        events.emit("fileWritten", file.path, content, nextState);
      }
      return;
    }

    const sanitizedFiles = files.map((file) => {
      let content = file.content;
      if (file.path === "package.json") {
        content = sanitizePackageJson(content);
      } else if (file.path === "vite.config.js") {
        content = sanitizeViteConfig(content);
        if (hasMalformedViteConfig(content)) {
          content = defaultViteConfig();
        }
      }
      return { ...file, content };
    });

    await writeFilesToContainer(sanitizedFiles, {
      onFileWritten(path, content) {
        const nextState = projectState.updateFromFile(path, content);
        projectState.saveToLocalStorage();
        events.emit("fileWritten", path, content, nextState);
      },
    });
  }

  function isInstallCommand(command) {
    return /\b(npm|pnpm|yarn)\s+(install|i)\b/i.test(String(command || ""));
  }

  async function runShell(commands) {
    const result = await shellQueue.runMany(commands);
    const firstFailure = result.find((step) => step.exitCode !== 0);

    if (!firstFailure) {
      for (const step of result) {
        if (isInstallCommand(step.command)) {
          dependenciesInstalled = true;
        }
      }
    }

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

  async function ensureDevServer(command = "npm run dev -- --host") {
    if (mode === "dry-run") {
      return startDryCommand(command, { onOutput: handleOutput });
    }

    if (devServerProcess) {
      return { command, process: devServerProcess, reused: true };
    }

    let resolvedCommand = command;
    const pkg = await readPackageJson();
    if (pkg) {
      const devScript = pkg.scripts?.dev;
      const needsDevFix =
        !devScript || (typeof devScript === "string" && devScript.includes("vite--host"));
      if (needsDevFix) {
        const nextContent = sanitizePackageJson(JSON.stringify(pkg));
        try {
          const container = await getWebContainer();
          await container.fs.writeFile("package.json", nextContent);
        } catch {
          // Ignore write failure, fall back to running vite directly.
        }
        resolvedCommand = "npx vite --host";
      }
    }

    const started = await startShell(resolvedCommand);
    devServerProcess = started.process;

    if (devServerProcess?.exit) {
      devServerProcess.exit
        .then((code) => {
          if (typeof code === "number" && code !== 0) {
            events.emit("error", new Error(`Dev server exited with code ${code}`));
          }
        })
        .catch(() => null)
        .finally(() => {
          devServerProcess = null;
        });
    }

    return { ...started, reused: false };
  }

  async function ensureDependencies(command = "npm install") {
    if (dependenciesInstalled) {
      return { skipped: true };
    }

    if (mode === "dry-run") {
      dependenciesInstalled = true;
      return runDryCommand(command, { onOutput: handleOutput });
    }

    const pkg = await readPackageJson();
    if (!pkg) {
      events.emit("error", new Error("package.json not found in WebContainer"));
      return { skipped: true, reason: "missing_package_json" };
    }

    // Ensure safe Tailwind toolchain versions inside the container.
    const needsAutoprefixerFix =
      pkg.devDependencies &&
      pkg.devDependencies.autoprefixer &&
      /^(\^)?11(\.|$)/.test(String(pkg.devDependencies.autoprefixer));
    const needsDevScriptFix =
      typeof pkg.scripts?.dev === "string" && pkg.scripts.dev.includes("vite--host");

    if (needsAutoprefixerFix || !pkg.devDependencies?.autoprefixer || needsDevScriptFix) {
      const nextContent = sanitizePackageJson(JSON.stringify(pkg));
      try {
        const container = await getWebContainer();
        await container.fs.writeFile("package.json", nextContent);
      } catch {
        // Ignore write failure; npm install will surface if it still breaks.
      }
    }

    const result = await runShell([command]);
    const ok = result?.[0]?.exitCode === 0;
    if (ok) dependenciesInstalled = true;
    return result?.[0] || { command, exitCode: ok ? 0 : 1 };
  }

  return {
    initWebContainer,
    writeFiles,
    runShell,
    startShell,
    ensureDevServer,
    ensureDependencies,
    getProjectState: projectState.getState,
    restoreProjectState: projectState.restoreFromLocalStorage,
    onFileWritten: events.onFileWritten,
    onShellOutput: events.onShellOutput,
    onError: events.onError,
    getMode: () => mode,
  };
}

let webcontainerInstance = null;

async function loadWebContainer() {
  const mod = await import("@webcontainer/api");
  return mod.WebContainer;
}

async function ensureDir(webcontainer, path) {
  const segments = path.split("/").slice(0, -1);
  let current = "";

  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    try {
      await webcontainer.fs.mkdir(current);
    } catch {
      // Directory already exists.
    }
  }
}

export async function initWebContainer(options = {}) {
  if (webcontainerInstance) return webcontainerInstance;

  const WebContainer = await loadWebContainer();
  webcontainerInstance = await WebContainer.boot();

  if (typeof options.onServerReady === "function") {
    webcontainerInstance.on("server-ready", (port, url) => {
      options.onServerReady({ port, url });
    });
  }

  return webcontainerInstance;
}

export async function getWebContainer() {
  if (!webcontainerInstance) {
    throw new Error("WebContainer is not initialized. Call initWebContainer() first.");
  }
  return webcontainerInstance;
}

export async function writeFiles(files, options = {}) {
  const container = await getWebContainer();

  const writes = files.map(async (file) => {
    await ensureDir(container, file.path);
    await container.fs.writeFile(file.path, file.content);

    if (typeof options.onFileWritten === "function") {
      options.onFileWritten(file.path, file.content);
    }
  });

  await Promise.all(writes);
}

export async function mountFiles(tree) {
  const container = await getWebContainer();
  await container.mount(tree);
}

export async function teardownWebContainer() {
  if (!webcontainerInstance) return;
  webcontainerInstance.teardown();
  webcontainerInstance = null;
}
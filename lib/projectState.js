const STORAGE_KEY = "builder:projectState";
const MAX_RECENT_FILES = 20;

const DEFAULT_STATE = {
  name: "AppName",
  routes: ["/"],
  components: [],
  dependencies: [],
  recentFiles: [],
};

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function parseRoutes(content) {
  const routeMatches = [...content.matchAll(/path=["']([^"']+)["']/g)].map(
    (m) => m[1]
  );
  return routeMatches.filter((route) => route.startsWith("/"));
}

function parseComponents(content) {
  const importMatches = [
    ...content.matchAll(/import\s+([A-Z][A-Za-z0-9_]*)\s+from/g),
  ].map((m) => m[1]);
  const jsxMatches = [...content.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(
    (m) => m[1]
  );
  return unique([...importMatches, ...jsxMatches]);
}

function parseDependencies(packageJsonContent) {
  try {
    const parsed = JSON.parse(packageJsonContent);
    return unique([
      ...Object.keys(parsed.dependencies || {}),
      ...Object.keys(parsed.devDependencies || {}),
    ]);
  } catch {
    return [];
  }
}

export function createProjectState(initial = {}) {
  let state = {
    ...DEFAULT_STATE,
    ...initial,
    routes: unique(initial.routes || DEFAULT_STATE.routes),
    components: unique(initial.components || DEFAULT_STATE.components),
    dependencies: unique(initial.dependencies || DEFAULT_STATE.dependencies),
    recentFiles: unique(initial.recentFiles || DEFAULT_STATE.recentFiles),
  };

  function getState() {
    return {
      ...state,
      routes: [...state.routes],
      components: [...state.components],
      dependencies: [...state.dependencies],
      recentFiles: [...state.recentFiles],
    };
  }

  function setState(next) {
    state = {
      ...DEFAULT_STATE,
      ...next,
      routes: unique(next.routes || []),
      components: unique(next.components || []),
      dependencies: unique(next.dependencies || []),
      recentFiles: unique(next.recentFiles || []).slice(0, MAX_RECENT_FILES),
    };
    return getState();
  }

  function touchFile(path) {
    state.recentFiles = unique([path, ...state.recentFiles]).slice(
      0,
      MAX_RECENT_FILES
    );
  }

  function updateFromFile(path, content) {
    touchFile(path);

    if (/src\/(pages|routes|app)\//.test(path) || path.endsWith(".jsx")) {
      state.routes = unique([...state.routes, ...parseRoutes(content)]);
      state.components = unique([...state.components, ...parseComponents(content)]);
    }

    if (path === "package.json") {
      state.dependencies = parseDependencies(content);
      if (!state.name || state.name === DEFAULT_STATE.name) {
        try {
          const pkg = JSON.parse(content);
          state.name = pkg.name || state.name;
        } catch {
          // Keep state name unchanged when JSON parsing fails.
        }
      }
    }

    return getState();
  }

  function saveToLocalStorage() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function restoreFromLocalStorage() {
    if (typeof window === "undefined") return getState();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getState();
    try {
      return setState(JSON.parse(raw));
    } catch {
      return getState();
    }
  }

  function clearLocalStorage() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return {
    getState,
    setState,
    updateFromFile,
    saveToLocalStorage,
    restoreFromLocalStorage,
    clearLocalStorage,
  };
}

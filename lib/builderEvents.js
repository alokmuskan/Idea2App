export const BUILDER_EVENTS = {
  FILE_WRITTEN: "builder:file-written",
  SHELL_OUTPUT: "builder:shell-output",
  ERROR: "builder:error",
  PROJECT_STATE: "builder:project-state",
  PREVIEW_URL: "builder:preview-url",
  FILES_CHANGED: "builder:files-changed",
};

export function emitBuilderEvent(eventName, detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

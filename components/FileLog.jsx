"use client";

export default function FileLog({ files = [], onCopy }) {
  return (
    <div className="panel">
      <div className="border-b border-border/70 px-5 py-4">
        <p className="pill">Files</p>
        <h3 className="mt-2 font-display text-2xl tracking-tight">Generation log</h3>
      </div>
      <div className="max-h-64 overflow-y-auto px-5 py-4">
        {files.length === 0 ? (
          <div className="text-sm text-muted">No files written yet.</div>
        ) : (
          <ul className="grid gap-3 text-sm">
            {files.map((file) => (
              <li key={file.path} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-semibold ${
                      file.status === "done"
                        ? "border-accent bg-accent text-white"
                        : file.status === "error"
                        ? "border-red-400 bg-red-100 text-red-600"
                        : "border-border bg-white"
                    }`}
                  >
                    {file.status === "done" ? "✓" : file.status === "error" ? "!" : "•"}
                  </span>
                  <span className="font-medium text-ink">{file.path}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onCopy?.(file)}
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-accent"
                >
                  Copy
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

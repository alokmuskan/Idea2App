"use client";

export default function ShellLog({ lines = [] }) {
  const hasLines = Array.isArray(lines) && lines.length > 0;

  return (
    <div className="panel flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Shell Output</p>
        <span className="chip text-muted">{hasLines ? `${lines.length} lines` : "Idle"}</span>
      </div>
      <div className="flex-1 overflow-auto bg-white/60 p-4 text-xs leading-relaxed text-ink">
        {hasLines ? (
          <pre className="whitespace-pre-wrap">{lines.join("\n")}</pre>
        ) : (
          <div className="text-sm text-muted">Shell output will appear here once commands run.</div>
        )}
      </div>
    </div>
  );
}

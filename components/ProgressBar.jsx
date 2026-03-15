"use client";

export default function ProgressBar({ label = "Idle", progress = 0 }) {
  const value = Math.min(100, Math.max(0, progress));
  return (
    <div className="panel px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Progress</p>
        <span className="text-xs font-semibold text-ink">{label}</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/70">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

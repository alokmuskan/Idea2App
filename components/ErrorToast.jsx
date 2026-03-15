"use client";

export default function ErrorToast({ message, visible }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-border bg-white/90 px-5 py-4 shadow-lift">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Auto Recovery</p>
      <p className="mt-2 text-sm text-ink">{message || "Issue detected and fixed automatically."}</p>
    </div>
  );
}

"use client";

export default function FilesChanged({ count = 0 }) {
  if (!count) return null;
  return (
    <div className="chip border-accent bg-white/80 text-accent">
      <span className="inline-block h-2 w-2 rounded-full bg-accent" />
      {count} files changed
    </div>
  );
}

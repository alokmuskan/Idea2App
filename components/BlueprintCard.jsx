"use client";

import { useEffect, useMemo, useState } from "react";

function extractSteps(planText) {
  if (!planText) return [];
  const match = planText.match(/<plan>([\s\S]*?)<\/plan>/i);
  const raw = match ? match[1] : planText;
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
  return lines.map((line) => line.replace(/^\d+\.?\s*/, ""));
}

export default function BlueprintCard({ plan, onConfirm, onRegenerate, autoCollapse }) {
  const [collapsed, setCollapsed] = useState(false);
  const steps = useMemo(() => extractSteps(plan), [plan]);

  useEffect(() => {
    if (autoCollapse) setCollapsed(true);
  }, [autoCollapse]);

  if (!plan) return null;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div>
          <p className="pill">Blueprint</p>
          <h3 className="mt-2 font-display text-2xl tracking-tight">Plan before build</h3>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="text-xs font-semibold uppercase tracking-[0.2em] text-accent"
        >
          {collapsed ? "View plan" : "Collapse"}
        </button>
      </div>

      {!collapsed ? (
        <div className="px-5 py-4">
          <ol className="grid gap-3 text-sm">
            {steps.map((step, index) => (
              <li key={`${step}-${index}`} className="flex gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-border bg-white text-xs font-semibold">
                  {index + 1}
                </span>
                <p className="flex-1 text-muted">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-border/70 px-5 py-4">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-full bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white"
        >
          Confirm and build
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          className="rounded-full border border-border bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink"
        >
          Regenerate plan
        </button>
      </div>
    </div>
  );
}

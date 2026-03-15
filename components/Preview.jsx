"use client";

import { useMemo, useState } from "react";

export default function Preview({ url, routes = [], title }) {
  const [activeRoute, setActiveRoute] = useState(routes[0] || "/");

  const iframeSrc = useMemo(() => {
    if (!url) return "";
    if (!activeRoute.startsWith("/")) return `${url}/${activeRoute}`;
    return `${url}${activeRoute}`;
  }, [url, activeRoute]);

  return (
    <div className="panel flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div>
          <p className="pill">Live Preview</p>
          <h2 className="mt-2 font-display text-2xl tracking-tight">{title || "Generated app"}</h2>
        </div>
        <span className="chip text-muted">{url ? "Running" : "Idle"}</span>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="border-b border-border/70 bg-white/70 p-4 lg:w-60 lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Routes</p>
          <div className="mt-4 flex flex-wrap gap-2 lg:flex-col">
            {routes.length === 0 ? (
              <div className="text-sm text-muted">No routes yet</div>
            ) : (
              routes.map((route) => (
                <button
                  key={route}
                  type="button"
                  onClick={() => setActiveRoute(route)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    route === activeRoute
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-white/60 text-ink"
                  }`}
                >
                  {route}
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="flex-1 bg-white/40 p-4">
          {url ? (
            <div className="h-full overflow-hidden rounded-2xl border border-border bg-white">
              <iframe
                title="Live preview"
                src={iframeSrc}
                className="h-full w-full"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-border bg-white/70 p-6 text-sm text-muted">
              Preview will appear once the WebContainer starts and files are generated.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

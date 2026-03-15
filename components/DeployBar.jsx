"use client";

export default function DeployBar({ onDeploy, vercelUrl, githubUrl, isLoading }) {
  return (
    <div className="panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="pill">Ship it</p>
        <h3 className="mt-2 font-display text-2xl tracking-tight">Push & Deploy</h3>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onDeploy}
          disabled={isLoading}
          className="rounded-full bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white disabled:opacity-60"
        >
          {isLoading ? "Deploying..." : "Push & Deploy"}
        </button>
        {githubUrl ? (
          <a
            href={githubUrl}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-accent"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        ) : null}
        {vercelUrl ? (
          <a
            href={vercelUrl}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-accent"
            target="_blank"
            rel="noreferrer"
          >
            Live URL
          </a>
        ) : null}
      </div>
    </div>
  );
}

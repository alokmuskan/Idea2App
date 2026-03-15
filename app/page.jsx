import Brief from "../components/Brief.jsx";

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-white shadow-soft">
            <span className="font-display text-2xl">I2A</span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Idea2App</p>
            <h1 className="font-display text-2xl tracking-tight">AI App Builder</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="chip border-accent bg-white/70 text-accent">Hackathon build</span>
          <span className="chip border-border bg-white/70 text-muted">36-48 hours</span>
        </div>
      </header>

      <section className="mx-auto mt-10 grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel p-8">
          <p className="pill">Pitch</p>
          <h2 className="mt-4 font-display text-4xl leading-tight tracking-tight">
            Plan, build, and ship a product before your coffee cools.
          </h2>
          <p className="mt-4 text-base text-muted">
            This builder turns a focused brief into a live React app with streaming generation, live preview,
            and one-click deployment to GitHub and Vercel.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              "Intent classifier and plan-first workflow",
              "Live streaming file writes with progress UI",
              "WebContainer runtime with instant preview",
              "Push & deploy to GitHub + Vercel",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-8">
          <p className="pill">How it works</p>
          <ol className="mt-4 grid gap-4 text-sm text-muted">
            <li>
              <span className="font-semibold text-ink">1.</span> Capture the brief.
            </li>
            <li>
              <span className="font-semibold text-ink">2.</span> Confirm the blueprint.
            </li>
            <li>
              <span className="font-semibold text-ink">3.</span> Stream files into a live preview.
            </li>
            <li>
              <span className="font-semibold text-ink">4.</span> Refine and ship.
            </li>
          </ol>
          <div className="mt-6 rounded-2xl border border-border bg-white/80 px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted">
            Start below to kick off the build.
          </div>
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-6xl">
        <Brief />
      </section>
    </main>
  );
}

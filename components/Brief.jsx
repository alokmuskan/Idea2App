"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const templates = [
  {
    id: "saas",
    title: "SaaS Dashboard",
    summary: "Metrics-first control center for growing teams.",
    prefill: {
      problem: "Founders struggle to see revenue, churn, and pipeline in one place.",
      audience: "SaaS founders and growth leads.",
      coreAction: "Track KPIs, pipeline, and team goals in a single view.",
      inspiration: "Linear, Ramp, and Notion dashboards.",
    },
  },
  {
    id: "commerce",
    title: "E-commerce Store",
    summary: "A product-first storefront with focused conversion flow.",
    prefill: {
      problem: "Small brands need a premium storefront without a dev team.",
      audience: "Indie DTC brands.",
      coreAction: "Browse, compare, and purchase a curated product line.",
      inspiration: "Allbirds, Away, and Apple product pages.",
    },
  },
  {
    id: "link",
    title: "Link-in-bio",
    summary: "A sharp personal hub for creators and founders.",
    prefill: {
      problem: "Creators need one link that actually feels branded.",
      audience: "Creators, founders, and freelancers.",
      coreAction: "Showcase links, offers, and a quick contact CTA.",
      inspiration: "Typedream and super-styled Linktree pages.",
    },
  },
  {
    id: "blog",
    title: "Blog / CMS",
    summary: "A minimal editorial layout with strong typography.",
    prefill: {
      problem: "Teams want a clean editorial presence without heavy CMS setup.",
      audience: "Startups shipping thought leadership.",
      coreAction: "Read, filter, and share articles.",
      inspiration: "Medium, Stripe Press.",
    },
  },
  {
    id: "booking",
    title: "Booking System",
    summary: "A friendly booking flow with clear time slots.",
    prefill: {
      problem: "Service providers lose bookings due to confusing flows.",
      audience: "Coaches, studios, and consultants.",
      coreAction: "Choose a service, pick a time, confirm.",
      inspiration: "Cal.com and Airbnb scheduling.",
    },
  },
  {
    id: "invoice",
    title: "Invoice Generator",
    summary: "Generate polished invoices in seconds.",
    prefill: {
      problem: "Freelancers waste time formatting invoices manually.",
      audience: "Freelancers and small agencies.",
      coreAction: "Enter client info and download an invoice.",
      inspiration: "FreshBooks, Stripe Invoicing.",
    },
  },
];

const fields = [
  {
    id: "problem",
    label: "What problem are we solving?",
    placeholder: "Describe the pain point in one sentence.",
  },
  {
    id: "audience",
    label: "Who is this for?",
    placeholder: "Target user, role, or segment.",
  },
  {
    id: "coreAction",
    label: "What is the core action?",
    placeholder: "Primary action users should complete.",
  },
  {
    id: "inspiration",
    label: "Any inspiration or reference?",
    placeholder: "Examples, apps, or styles to emulate.",
  },
];

function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export default function Brief({ onSubmit }) {
  const router = useRouter();
  const [values, setValues] = useState(() => ({
    problem: "",
    audience: "",
    coreAction: "",
    inspiration: "",
  }));
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    const brief = readStored("builder:brief");
    const projectState = readStored("builder:projectState");
    setHasSaved(Boolean(brief || projectState));
  }, []);

  const canSubmit = useMemo(() => {
    return fields.every((field) => String(values[field.id]).trim().length > 0);
  }, [values]);

  function handleChange(id, value) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  function handleTemplate(template) {
    setSelectedTemplate(template.id);
    setValues({ ...template.prefill });
  }

  function handleContinue() {
    router.push("/builder");
  }

  function handleSubmit(event) {
    event.preventDefault();
    const brief = {
      ...values,
      template: selectedTemplate,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem("builder:brief", JSON.stringify(brief));
    if (typeof onSubmit === "function") {
      onSubmit(brief);
      return;
    }
    router.push("/builder");
  }

  return (
    <div className="grid gap-6">
      <div className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="pill">Project Brief</p>
            <h2 className="mt-3 font-display text-3xl tracking-tight">Start with the why</h2>
            <p className="mt-2 text-sm text-muted">
              Four answers give the system enough signal to build a real product, not just code.
            </p>
          </div>
          {hasSaved ? (
            <button
              type="button"
              onClick={handleContinue}
              className="rounded-full border border-border bg-white/70 px-4 py-2 text-sm font-semibold shadow-soft transition hover:-translate-y-0.5"
            >
              Continue where you left off
            </button>
          ) : null}
        </div>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          {fields.map((field) => (
            <label key={field.id} className="grid gap-2 text-sm font-medium">
              <span>{field.label}</span>
              <textarea
                rows={2}
                value={values[field.id]}
                onChange={(event) => handleChange(field.id, event.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded-xl border border-border bg-white/80 px-4 py-3 text-sm shadow-soft outline-none transition focus:border-accent"
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 inline-flex items-center justify-center rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Build my product
          </button>
        </form>
      </div>

      <div className="panel p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="pill">Templates</p>
            <h3 className="mt-2 font-display text-2xl tracking-tight">Or start from a proven pattern</h3>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => handleTemplate(template)}
              className={`group rounded-2xl border px-5 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift ${
                selectedTemplate === template.id
                  ? "border-accent bg-white"
                  : "border-border bg-white/70"
              }`}
            >
              <h4 className="font-display text-xl tracking-tight">{template.title}</h4>
              <p className="mt-2 text-sm text-muted">{template.summary}</p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Use template
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import BlueprintCard from "../../components/BlueprintCard.jsx";
import Chat from "../../components/Chat.jsx";
import DeployBar from "../../components/DeployBar.jsx";
import ErrorToast from "../../components/ErrorToast.jsx";
import FileLog from "../../components/FileLog.jsx";
import FilesChanged from "../../components/FilesChanged.jsx";
import Preview from "../../components/Preview.jsx";
import ProgressBar from "../../components/ProgressBar.jsx";
import { BUILDER_EVENTS } from "../../lib/builderEvents.js";

function readStored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function extractPlan(text) {
  if (!text) return "";
  const match = text.match(/<plan>[\s\S]*?<\/plan>/i);
  return match ? match[0] : "";
}

function extractFiles(text) {
  if (!text) return [];
  const files = [];
  const regex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/gi;
  let match;
  while ((match = regex.exec(text))) {
    files.push({
      path: match[1],
      content: match[2],
      status: "done",
    });
  }
  return files;
}

export default function BuilderPage() {
  const [messages, setMessages] = useState(() => readStored("builder:messages", []));
  const [plan, setPlan] = useState("");
  const [files, setFiles] = useState([]);
  const [progressLabel, setProgressLabel] = useState("Idle");
  const [progress, setProgress] = useState(0);
  const [routes, setRoutes] = useState(() => readStored("builder:projectState", {}).routes || []);
  const [previewUrl, setPreviewUrl] = useState("http://localhost:5173");
  const [filesChanged, setFilesChanged] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deployState, setDeployState] = useState({ vercelUrl: null, githubUrl: null, isLoading: false });

  const brief = useMemo(() => readStored("builder:brief", null), []);

  useEffect(() => {
    localStorage.setItem("builder:messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    const handleFile = (event) => {
      const detail = event.detail || {};
      if (!detail.path) return;
      setFiles((prev) => {
        const existing = prev.find((f) => f.path === detail.path);
        if (existing) {
          return prev.map((f) =>
            f.path === detail.path ? { ...f, status: "done", content: detail.content ?? f.content } : f
          );
        }
        return [...prev, { path: detail.path, content: detail.content || "", status: "done" }];
      });
    };

    const handleShell = (event) => {
      const line = String(event.detail?.line || "");
      if (!line) return;
      if (line.toLowerCase().includes("install")) {
        setProgressLabel("Installing dependencies");
        setProgress(55);
      } else if (line.toLowerCase().includes("vite")) {
        setProgressLabel("Starting dev server");
        setProgress(85);
      }
    };

    const handleError = () => {
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 4000);
    };

    const handleProjectState = (event) => {
      const state = event.detail || {};
      if (Array.isArray(state.routes)) setRoutes(state.routes);
      localStorage.setItem("builder:projectState", JSON.stringify(state));
    };

    const handlePreview = (event) => {
      if (event.detail?.url) setPreviewUrl(event.detail.url);
    };

    const handleFilesChanged = (event) => {
      const count = Number(event.detail?.count || 0);
      setFilesChanged(count);
    };

    window.addEventListener(BUILDER_EVENTS.FILE_WRITTEN, handleFile);
    window.addEventListener(BUILDER_EVENTS.SHELL_OUTPUT, handleShell);
    window.addEventListener(BUILDER_EVENTS.ERROR, handleError);
    window.addEventListener(BUILDER_EVENTS.PROJECT_STATE, handleProjectState);
    window.addEventListener(BUILDER_EVENTS.PREVIEW_URL, handlePreview);
    window.addEventListener(BUILDER_EVENTS.FILES_CHANGED, handleFilesChanged);

    return () => {
      window.removeEventListener(BUILDER_EVENTS.FILE_WRITTEN, handleFile);
      window.removeEventListener(BUILDER_EVENTS.SHELL_OUTPUT, handleShell);
      window.removeEventListener(BUILDER_EVENTS.ERROR, handleError);
      window.removeEventListener(BUILDER_EVENTS.PROJECT_STATE, handleProjectState);
      window.removeEventListener(BUILDER_EVENTS.PREVIEW_URL, handlePreview);
      window.removeEventListener(BUILDER_EVENTS.FILES_CHANGED, handleFilesChanged);
    };
  }, []);

  async function handleSend(text) {
    setIsLoading(true);
    setProgressLabel("Planning");
    setProgress(20);

    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          stream: false,
          projectState: readStored("builder:projectState", {}),
        }),
      });
      const data = await res.json();
      const assistantContent = data.content || "";
      const newPlan = data.plan || extractPlan(assistantContent);
      const newFiles = extractFiles(assistantContent);

      setPlan(newPlan);
      setFilesChanged(newFiles.length);
      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles]);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent || "Build complete." }]);
      setProgressLabel("Complete");
      setProgress(100);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error instanceof Error ? error.message : "Request failed"}` },
      ]);
      setProgressLabel("Error");
      setProgress(0);
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopy(file) {
    if (!file?.content) return;
    navigator.clipboard?.writeText(file.content);
  }

  async function handleDeploy() {
    if (files.length === 0) return;
    setDeployState((prev) => ({ ...prev, isLoading: true }));
    try {
      const res = await fetch("/api/push-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((file) => ({ path: file.path, content: file.content })),
          name: brief?.problem?.slice(0, 30) || "idea2app-build",
          repo: brief?.problem?.slice(0, 30) || "idea2app-build",
        }),
      });
      const data = await res.json();
      setDeployState({
        vercelUrl: data.vercel?.url || null,
        githubUrl: data.github?.repoUrl || null,
        isLoading: false,
      });
    } catch {
      setDeployState((prev) => ({ ...prev, isLoading: false }));
    }
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Builder</p>
          <h1 className="font-display text-3xl tracking-tight">Live product studio</h1>
          <p className="mt-2 text-sm text-muted">
            {brief?.problem ? `Brief: ${brief.problem}` : "Start a project from the landing page."}
          </p>
        </div>
        <FilesChanged count={filesChanged} />
      </header>

      <section className="mx-auto mt-6 grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid gap-6">
          <BlueprintCard
            plan={plan}
            onConfirm={() => setProgressLabel("Generating files")}
            onRegenerate={() => handleSend("Regenerate the plan for the same brief.")}
            autoCollapse={files.length > 0}
          />
          <Chat messages={messages} onSend={handleSend} isLoading={isLoading} />
          <ProgressBar label={progressLabel} progress={progress} />
          <FileLog files={files} onCopy={handleCopy} />
        </div>
        <div className="grid gap-6">
          <Preview url={previewUrl} routes={routes} title={brief?.coreAction || "Generated app"} />
          <DeployBar
            onDeploy={handleDeploy}
            vercelUrl={deployState.vercelUrl}
            githubUrl={deployState.githubUrl}
            isLoading={deployState.isLoading}
          />
        </div>
      </section>

      <ErrorToast visible={toastVisible} />
    </main>
  );
}

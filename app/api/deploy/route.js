import { insertDeployment, fireAndForget } from "../../../lib/supabase.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeFilesInput(files) {
  if (Array.isArray(files)) {
    return files
      .filter((f) => f && typeof f.path === "string")
      .map((f) => ({
        file: f.path.replace(/^\//, ""),
        data: String(f.content ?? ""),
      }));
  }
  if (files && typeof files === "object") {
    return Object.entries(files).map(([path, content]) => ({
      file: path.replace(/^\//, ""),
      data: String(content ?? ""),
    }));
  }
  return [];
}

function sanitizeName(name) {
  return String(name || "ai-builder-app")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return Response.json({ error: "Missing VERCEL_TOKEN" }, { status: 500 });
  }

  const files = normalizeFilesInput(body.files);
  if (!files.length) {
    return Response.json({ error: "files is required" }, { status: 400 });
  }

  const name = sanitizeName(body.name || body.projectName || "ai-builder-app");
  const target = body.target || "production";
  const teamId = body.teamId;
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  const payload = {
    name,
    files,
    target,
    projectSettings: {
      framework: "vite",
    },
  };

  const response = await fetch(`https://api.vercel.com/v13/deployments${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    return Response.json({ error: "Vercel deploy failed", details: text }, { status: 500 });
  }

  const data = await response.json();
  const url = data?.url ? `https://${data.url}` : null;

  if (body.snapshotId && url) {
    fireAndForget(() => insertDeployment({ snapshotId: body.snapshotId, vercelUrl: url, githubUrl: null }));
  }

  return Response.json({ url, deployment: data });
}

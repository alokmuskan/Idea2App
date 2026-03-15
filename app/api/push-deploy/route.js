import { insertDeployment, fireAndForget } from "../../../lib/supabase.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeFilesInput(files) {
  if (Array.isArray(files)) {
    return files
      .filter((f) => f && typeof f.path === "string")
      .map((f) => ({
        path: f.path.replace(/^\//, ""),
        content: String(f.content ?? ""),
      }));
  }
  if (files && typeof files === "object") {
    return Object.entries(files).map(([path, content]) => ({
      path: path.replace(/^\//, ""),
      content: String(content ?? ""),
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

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function githubRequest(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
      ...(options.headers || {}),
    },
  });
  return res;
}

async function getViewer(token) {
  const res = await githubRequest("https://api.github.com/user", token);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub user lookup failed: ${text}`);
  }
  return res.json();
}

async function ensureRepo({ token, owner, repo, isPrivate }) {
  if (owner && repo) return { owner, repo };
  const viewer = await getViewer(token);
  const login = viewer.login;
  const payload = {
    name: repo,
    private: Boolean(isPrivate),
  };
  const res = await githubRequest("https://api.github.com/user/repos", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    const data = await res.json();
    return { owner: data.owner?.login || login, repo: data.name || repo };
  }
  if (res.status === 422) {
    return { owner: login, repo };
  }
  const text = await res.text();
  throw new Error(`GitHub repo create failed: ${text}`);
}

async function getFileSha({ token, owner, repo, path }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}`;
  const res = await githubRequest(url, token);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub content lookup failed: ${text}`);
  }
  const data = await res.json();
  return data.sha || null;
}

async function putFile({ token, owner, repo, path, content, message }) {
  const sha = await getFileSha({ token, owner, repo, path });
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}`;
  const payload = {
    message,
    content: Buffer.from(content).toString("base64"),
  };
  if (sha) payload.sha = sha;

  const res = await githubRequest(url, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub file write failed (${path}): ${text}`);
  }
  return res.json();
}

async function deployToVercel({ files, name, target, teamId, token }) {
  const payload = {
    name,
    files: files.map((f) => ({ file: f.path, data: f.content })),
    target: target || "production",
    projectSettings: { framework: "vite" },
  };
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const res = await fetch(`https://api.vercel.com/v13/deployments${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vercel deploy failed: ${text}`);
  }
  const data = await res.json();
  return { url: data?.url ? `https://${data.url}` : null, deployment: data };
}

async function pushToGitHub({ files, token, repoName, owner, isPrivate, message }) {
  const repoInfo = await ensureRepo({ token, owner, repo: repoName, isPrivate });
  await Promise.all(
    files.map((file) =>
      putFile({
        token,
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: file.path,
        content: file.content,
        message,
      })
    )
  );
  return { repoUrl: `https://github.com/${repoInfo.owner}/${repoInfo.repo}`, owner: repoInfo.owner, repo: repoInfo.repo };
}

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const files = normalizeFilesInput(body.files);
  if (!files.length) {
    return Response.json({ error: "files is required" }, { status: 400 });
  }

  const vercelToken = process.env.VERCEL_TOKEN;
  const githubToken = body.githubToken || body.token || process.env.GITHUB_TOKEN;

  if (!vercelToken && !githubToken) {
    return Response.json({ error: "Missing Vercel and GitHub tokens" }, { status: 400 });
  }

  const name = sanitizeName(body.name || body.projectName || "ai-builder-app");
  const repoName = sanitizeName(body.repo || body.repoName || body.projectName || "ai-builder-app");
  const teamId = body.teamId;
  const target = body.target;
  const owner = body.owner || null;
  const isPrivate = body.private === true;
  const message = body.message || "Initial commit";

  const results = await Promise.allSettled([
    vercelToken
      ? deployToVercel({ files, name, target, teamId, token: vercelToken })
      : Promise.resolve({ url: null, deployment: null }),
    githubToken
      ? pushToGitHub({ files, token: githubToken, repoName, owner, isPrivate, message })
      : Promise.resolve({ repoUrl: null, owner: null, repo: null }),
  ]);

  const vercelResult = results[0].status === "fulfilled" ? results[0].value : { error: results[0].reason?.message };
  const githubResult = results[1].status === "fulfilled" ? results[1].value : { error: results[1].reason?.message };

  if (body.snapshotId && vercelResult.url) {
    fireAndForget(() => insertDeployment({ snapshotId: body.snapshotId, vercelUrl: vercelResult.url, githubUrl: githubResult.repoUrl || null }));
  }

  return Response.json({
    vercel: vercelResult,
    github: githubResult,
  });
}

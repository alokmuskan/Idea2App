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

function sanitizeRepoName(name) {
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
  const name = repo || sanitizeRepoName(repo);
  const payload = {
    name,
    private: Boolean(isPrivate),
  };
  const res = await githubRequest("https://api.github.com/user/repos", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    const data = await res.json();
    return { owner: data.owner?.login || login, repo: data.name || name };
  }
  if (res.status === 422) {
    return { owner: login, repo: name };
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

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = body.token || process.env.GITHUB_TOKEN;
  if (!token) {
    return Response.json({ error: "Missing GitHub OAuth token" }, { status: 400 });
  }

  const files = normalizeFilesInput(body.files);
  if (!files.length) {
    return Response.json({ error: "files is required" }, { status: 400 });
  }

  const repoName = sanitizeRepoName(body.repo || body.repoName || body.projectName || "ai-builder-app");
  const isPrivate = body.private === true;
  const owner = body.owner || null;

  let repoInfo;
  try {
    repoInfo = await ensureRepo({ token, owner, repo: repoName, isPrivate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "repo_create_failed";
    return Response.json({ error: message }, { status: 500 });
  }

  const commitMessage = body.message || "Initial commit";

  try {
    await Promise.all(
      files.map((file) =>
        putFile({
          token,
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          path: file.path,
          content: file.content,
          message: commitMessage,
        })
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "file_upload_failed";
    return Response.json({ error: message }, { status: 500 });
  }

  const repoUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}`;

  return Response.json({ repoUrl, owner: repoInfo.owner, repo: repoInfo.repo });
}

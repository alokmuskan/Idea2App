// Thin Supabase wrapper for non-blocking persistence.
import { createClient } from "@supabase/supabase-js";

let supabaseClient = null;

// Lazily initialize to keep serverless cold starts minimal.
function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  supabaseClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return supabaseClient;
}

// Fire-and-forget wrapper to avoid blocking the request path.
export function fireAndForget(task) {
  try {
    const result = typeof task === "function" ? task() : task;
    Promise.resolve(result).catch(() => {});
  } catch {
    // ignore
  }
}

export async function insertProject({ userId, name, brief }) {
  const client = getSupabaseClient();
  if (!client) return { error: "supabase_not_configured" };
  return client
    .from("projects")
    .insert({ user_id: userId, name, brief })
    .select()
    .single();
}

export async function insertPrompt({ projectId, role, message }) {
  const client = getSupabaseClient();
  if (!client) return { error: "supabase_not_configured" };
  return client
    .from("prompts")
    .insert({ project_id: projectId, role, message })
    .select()
    .single();
}

export async function insertSnapshot({ projectId, promptId, files }) {
  const client = getSupabaseClient();
  if (!client) return { error: "supabase_not_configured" };
  return client
    .from("snapshots")
    .insert({ project_id: projectId, prompt_id: promptId, files })
    .select()
    .single();
}

export async function insertDeployment({ snapshotId, vercelUrl, githubUrl }) {
  const client = getSupabaseClient();
  if (!client) return { error: "supabase_not_configured" };
  return client
    .from("deployments")
    .insert({ snapshot_id: snapshotId, vercel_url: vercelUrl, github_url: githubUrl })
    .select()
    .single();
}

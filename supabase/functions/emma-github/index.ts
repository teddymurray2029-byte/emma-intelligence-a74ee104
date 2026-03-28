import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));

async function getClerkUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS);
    return (payload.sub as string) || null;
  } catch { return null; }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const userId = await getClerkUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
  if (!GITHUB_TOKEN) return json({ error: "GitHub token not configured" }, 500);

  const body = await req.json();
  const { action, repo } = body;
  const headers = { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" };

  try {
    switch (action) {
      case "list_repos": {
        const resp = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", { headers });
        const repos = await resp.json();
        return json({ data: repos.map((r: any) => ({ full_name: r.full_name, description: r.description, private: r.private, default_branch: r.default_branch })) });
      }

      case "pull": {
        if (!repo) return json({ error: "Missing repo" }, 400);
        // Get default branch
        const repoResp = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        if (!repoResp.ok) return json({ error: "Repo not found" }, 404);
        const repoData = await repoResp.json();
        const branch = repoData.default_branch;

        // Get tree
        const treeResp = await fetch(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, { headers });
        const treeData = await treeResp.json();

        const files: { path: string; content: string }[] = [];
        const blobPromises = (treeData.tree || [])
          .filter((item: any) => item.type === "blob" && item.size < 500000)
          .slice(0, 200)
          .map(async (item: any) => {
            try {
              const blobResp = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${item.sha}`, { headers });
              const blobData = await blobResp.json();
              if (blobData.encoding === "base64") {
                const content = atob(blobData.content.replace(/\n/g, ""));
                files.push({ path: item.path, content });
              }
            } catch {}
          });
        await Promise.all(blobPromises);
        return json({ files });
      }

      case "push":
      case "commit": {
        if (!repo) return json({ error: "Missing repo" }, 400);
        const { files, message } = body;
        if (!files?.length || !message) return json({ error: "Missing files or message" }, 400);

        // Get latest commit SHA
        const refResp = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        const repoData = await refResp.json();
        const branch = repoData.default_branch;

        const branchResp = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, { headers });
        const branchData = await branchResp.json();
        const latestSha = branchData.object.sha;

        // Create blobs
        const treeItems: any[] = [];
        for (const file of files) {
          const blobResp = await fetch(`https://api.github.com/repos/${repo}/git/blobs`, {
            method: "POST", headers, body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
          });
          const blob = await blobResp.json();
          treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
        }

        // Create tree
        const newTreeResp = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
          method: "POST", headers, body: JSON.stringify({ base_tree: latestSha, tree: treeItems }),
        });
        const newTree = await newTreeResp.json();

        // Create commit
        const commitResp = await fetch(`https://api.github.com/repos/${repo}/git/commits`, {
          method: "POST", headers, body: JSON.stringify({ message, tree: newTree.sha, parents: [latestSha] }),
        });
        const commit = await commitResp.json();

        // Update ref
        await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, {
          method: "PATCH", headers, body: JSON.stringify({ sha: commit.sha }),
        });

        return json({ success: true, sha: commit.sha });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("emma-github error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

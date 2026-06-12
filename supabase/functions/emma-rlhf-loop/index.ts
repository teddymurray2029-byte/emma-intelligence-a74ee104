// Continual learning: pull recent message feedback + benchmark deltas, distill into a new prompt
// candidate, then auto-push the improvement report to GitHub.
// Triggered by pg_cron every 15 minutes via x-cron-secret.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function ai(apiKey: string, system: string, user: string, model = "google/gemini-2.5-pro"): Promise<string> {
  const r = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}`);
  return (await r.json()).choices?.[0]?.message?.content || "";
}

async function pickRepo(ghHeaders: Record<string, string>): Promise<string | null> {
  const configured = Deno.env.get("SELF_IMPROVE_REPO");
  if (configured && configured.includes("/")) return configured;
  const resp = await fetch("https://api.github.com/user/repos?per_page=10&sort=updated", { headers: ghHeaders });
  const repos = await resp.json();
  if (!Array.isArray(repos) || !repos.length) return null;
  return repos[0].full_name;
}

async function pushToGitHub(repo: string, path: string, content: string, message: string, token: string): Promise<{ sha: string; url: string }> {
  const ghHeaders = { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" };
  const repoResp = await fetch(`https://api.github.com/repos/${repo}`, { headers: ghHeaders });
  if (!repoResp.ok) throw new Error(`Repo lookup failed: ${repoResp.status}`);
  const branch = (await repoResp.json()).default_branch;

  const branchResp = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, { headers: ghHeaders });
  const latestSha = (await branchResp.json()).object.sha;

  const blobResp = await fetch(`https://api.github.com/repos/${repo}/git/blobs`, {
    method: "POST", headers: ghHeaders, body: JSON.stringify({ content, encoding: "utf-8" }),
  });
  const blobSha = (await blobResp.json()).sha;

  const treeResp = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
    method: "POST", headers: ghHeaders,
    body: JSON.stringify({ base_tree: latestSha, tree: [{ path, mode: "100644", type: "blob", sha: blobSha }] }),
  });
  const treeSha = (await treeResp.json()).sha;

  const commitResp = await fetch(`https://api.github.com/repos/${repo}/git/commits`, {
    method: "POST", headers: ghHeaders, body: JSON.stringify({ message, tree: treeSha, parents: [latestSha] }),
  });
  const commitSha = (await commitResp.json()).sha;

  await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH", headers: ghHeaders, body: JSON.stringify({ sha: commitSha }),
  });

  return { sha: commitSha, url: `https://github.com/${repo}/commit/${commitSha}` };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const provided = req.headers.get("x-cron-secret");
    const { data: secretRow } = await supabaseAdmin.from("cron_secrets").select("secret").eq("name", "rlhf").maybeSingle();
    const expected = secretRow?.secret || Deno.env.get("CRON_SECRET");
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const ghToken = Deno.env.get("GITHUB_TOKEN");
    const supabase = supabaseAdmin;

    const { data: runs } = await supabase.from("benchmark_runs").select("total_score, max_score, category_scores, system_prompt_version").order("created_at", { ascending: false }).limit(10);
    const { data: insights } = await supabase.from("admin_insights").select("id, description, category, data").eq("applied", false).order("created_at", { ascending: false }).limit(20);
    const { data: current } = await supabase.from("prompt_evolutions").select("*").eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle();

    const baseScore = runs?.length ? runs.reduce((s, r) => s + (Number(r.total_score) / Math.max(1, Number(r.max_score))), 0) / runs.length : 0;
    const insightCtx = (insights || []).map(i => `[${i.category}] ${i.description}`).join("\n");

    const sys = `You are an RLHF prompt evolver. Given the current system prompt and recent failure/success patterns, produce ONE refined system prompt that should improve performance. Keep it concise. Return JSON: {"new_prompt":"...","rationale":"...","predicted_delta":0.0}.`;
    const userMsg = `Current prompt:\n${current?.prompt_text || "(none)"}\n\nRecent baseline score: ${baseScore.toFixed(3)}\n\nRecent insights:\n${insightCtx.slice(0, 3000)}`;

    const raw = await ai(apiKey, sys, userMsg);
    let evo: any = {};
    try { evo = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch {}

    if (!evo.new_prompt) {
      return new Response(JSON.stringify({ skipped: true, reason: "no candidate" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nextVersion = (current?.version || 0) + 1;
    const { data: candidate } = await supabase.from("prompt_evolutions").insert({
      version: nextVersion,
      prompt_text: evo.new_prompt,
      source_insights: insights?.slice(0, 10) || [],
      performance_delta: evo.predicted_delta || 0,
      active: false,
    }).select().single();

    if (insights?.length) await supabase.from("admin_insights").update({ applied: true }).in("id", insights.map((i: any) => i.id));

    // Push to GitHub
    let push: { sha: string; url: string } | null = null;
    let pushError: string | null = null;
    if (ghToken) {
      try {
        const ghHeaders = { Authorization: `token ${ghToken}`, Accept: "application/vnd.github.v3+json" };
        const repo = await pickRepo(ghHeaders);
        if (!repo) throw new Error("No GitHub repo available");
        const ts = new Date().toISOString();
        const md = `# Emma Auto-Improvement v${nextVersion}\n\n**Generated:** ${ts}\n**Baseline score:** ${baseScore.toFixed(3)}\n**Predicted delta:** +${(evo.predicted_delta || 0).toFixed(3)}\n\n## Rationale\n${evo.rationale || "(none)"}\n\n## New System Prompt\n\n\`\`\`\n${evo.new_prompt}\n\`\`\`\n\n## Source Insights (${insights?.length || 0})\n${(insights || []).slice(0, 10).map((i: any) => `- [${i.category}] ${i.description}`).join("\n")}\n\n---\n_Auto-generated by emma-rlhf-loop (every 15 min)._\n`;
        push = await pushToGitHub(repo, `improvements/v${nextVersion}-${ts.slice(0, 19).replace(/[:T]/g, "-")}.md`, md, `chore(emma): auto-improve v${nextVersion} (+${(evo.predicted_delta || 0).toFixed(3)} predicted)`, ghToken);
      } catch (e) {
        pushError = e instanceof Error ? e.message : "push failed";
        console.error("github push error:", pushError);
      }
    }

    return new Response(JSON.stringify({ candidate, baseScore, rationale: evo.rationale, push, pushError }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("rlhf error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));

async function getClerkUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try { const { payload } = await jwtVerify(token, JWKS); return (payload.sub as string) || null; } catch { return null; }
}

const SYSTEM_PROMPT_VERSIONS: Record<number, string> = {
  1: `You are Emma — a cognitive reasoning system. Answer directly and concisely.`,
  2: `You are Emma — a multi-agent cognitive reasoning system. For every question: 1. Identify what's actually being asked 2. Consider counterarguments 3. State uncertainty explicitly 4. Give a precise final answer`,
  3: `You are Emma — a self-improving cognitive system. Process through: [REFRAME] [FIRST PRINCIPLES] [DEBATE] [ANSWER] with confidence level. For simple factual questions, answer directly.`,
};

async function callAI(apiKey: string, messages: any[]): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", messages }) });
  if (!resp.ok) return "";
  return (await resp.json()).choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action } = await req.json();

    if (action === "analyze") {
      const { data: lastRun } = await supabase.from("benchmark_runs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).single();
      if (!lastRun) return new Response(JSON.stringify({ error: "No benchmark data" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const catScores = lastRun.category_scores as Record<string, number>;
      const weakCategories = Object.entries(catScores).filter(([_, s]) => s < 70).sort((a, b) => a[1] - b[1]).map(([c, s]) => `${c}: ${s}/100`);
      const strongCategories = Object.entries(catScores).filter(([_, s]) => s >= 70).map(([c, s]) => `${c}: ${s}/100`);

      const analysis = await callAI(OPENAI_API_KEY, [{ role: "system", content: "System optimizer. Return JSON: {\"proposal\": \"...\", \"newPromptFragment\": \"...\", \"expectedImpact\": \"...\", \"risk\": \"...\"}" }, { role: "user", content: `Score: ${lastRun.total_score}/100, Weak: ${weakCategories.join(", ")}, Strong: ${strongCategories.join(", ")}` }]);
      let proposal: any;
      try { proposal = JSON.parse(analysis.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch { proposal = { proposal: "Enhance reasoning", newPromptFragment: "", expectedImpact: weakCategories.join(", "), risk: "Longer responses" }; }

      await supabase.from("improvement_logs").insert({ user_id: userId, improvement_type: "prompt_optimization", description: proposal.proposal, before_score: lastRun.total_score, diff_content: JSON.stringify(proposal), accepted: false });

      if (Number(lastRun.total_score) < 80) {
        const { data: existing } = await supabase.from("goals").select("id").eq("user_id", userId).eq("goal_type", "benchmark").eq("status", "active").limit(1);
        if (!existing?.length) await supabase.from("goals").insert({ user_id: userId, goal_type: "benchmark", description: `Improve from ${lastRun.total_score} to ${Math.min(Number(lastRun.total_score) + 10, 100)}`, priority: 1, status: "active", progress: Number(lastRun.total_score) });
      }

      return new Response(JSON.stringify({ currentScore: lastRun.total_score, weakCategories, strongCategories, proposal, nextPromptVersion: (lastRun.system_prompt_version as number) + 1, availableVersions: Object.keys(SYSTEM_PROMPT_VERSIONS).map(Number) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "apply") {
      const { data: latestLog } = await supabase.from("improvement_logs").select("*").eq("user_id", userId).eq("accepted", false).order("created_at", { ascending: false }).limit(1).single();
      if (latestLog) await supabase.from("improvement_logs").update({ accepted: true }).eq("id", latestLog.id);
      await supabase.from("memory_episodes").insert({ user_id: userId, episode_type: "self_improvement", content: `Applied: ${latestLog?.description || "optimization"}. Prev: ${latestLog?.before_score}`, relevance_score: 8 });
      return new Response(JSON.stringify({ success: true, message: "Improvement applied. Re-run benchmarks." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "goals") {
      const { data: goals } = await supabase.from("goals").select("*").eq("user_id", userId).order("priority", { ascending: true });
      return new Response(JSON.stringify({ goals: goals || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "memory") {
      const { data: episodes } = await supabase.from("memory_episodes").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
      return new Response(JSON.stringify({ episodes: episodes || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("self-improve error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

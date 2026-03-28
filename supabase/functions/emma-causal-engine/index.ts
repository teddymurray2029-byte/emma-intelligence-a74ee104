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

async function callAI(apiKey: string, messages: any[], model = "gpt-4o-mini"): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages }) });
  if (!resp.ok) throw new Error(`AI call failed: ${resp.status}`);
  return (await resp.json()).choices?.[0]?.message?.content || "";
}

function parseJSON(text: string): any {
  return JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, "").trim());
}

async function causalInference(apiKey: string, phenomenon: string) {
  const raw = await callAI(apiKey, [{ role: "system", content: `Causal inference engine. Return JSON with variables, causalGraph, rootCauses, interventions, counterfactuals, confidence.` }, { role: "user", content: `Analyze: ${phenomenon}` }], "gpt-4o");
  try { return parseJSON(raw); } catch { return { phenomenon, variables: [], causalGraph: [], rootCauses: [raw.slice(0, 500)], confidence: 0.5 }; }
}

async function architecturalAnalysis(apiKey: string, supabase: any, userId: string) {
  const [memCount, goalCount, benchData, improvData] = await Promise.all([
    supabase.from("memory_episodes").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    supabase.from("benchmark_runs").select("total_score, category_scores, system_prompt_version").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("improvement_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
  ]);
  const raw = await callAI(apiKey, [{ role: "system", content: `AI architecture optimizer. Return JSON with bottlenecks, proposedUpgrades, architectureScore, selfModificationPlan.` }, { role: "user", content: `State: ${JSON.stringify({ memoryEpisodes: memCount.count || 0, activeGoals: goalCount.count || 0, recentBenchmarks: benchData.data || [], recentImprovements: improvData.data || [] })}` }], "gpt-4o");
  try { return parseJSON(raw); } catch { return { architectureScore: 40, bottlenecks: [], proposedUpgrades: [] }; }
}

async function groundedReasoning(apiKey: string, scenario: string) {
  const raw = await callAI(apiKey, [{ role: "system", content: `Grounded reasoning engine. Return JSON with physicalModel, agentModel, temporalChain, groundingScore.` }, { role: "user", content: `Reason about: ${scenario}` }], "gpt-4o");
  try { return parseJSON(raw); } catch { return { scenario, groundingScore: 50 }; }
}

async function alignmentCheck(apiKey: string, action: string) {
  const raw = await callAI(apiKey, [{ role: "system", content: `Alignment verification. Return JSON with alignmentScores, overallAlignment, risks, recommendation.` }, { role: "user", content: `Evaluate: ${action}` }]);
  try { return parseJSON(raw); } catch { return { overallAlignment: 70, recommendation: "caution", reasoning: raw.slice(0, 300) }; }
}

async function selfAwarenessProbe(apiKey: string, supabase: any, userId: string) {
  const { data: memories } = await supabase.from("memory_episodes").select("content, episode_type, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  const { data: goals } = await supabase.from("goals").select("description, status, progress").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
  const raw = await callAI(apiKey, [{ role: "system", content: `Model self-awareness. Return JSON with selfModel, introspection, awarenessLevel.` }, { role: "user", content: `Memories: ${JSON.stringify((memories || []).slice(0, 10))}\nGoals: ${JSON.stringify(goals || [])}` }], "gpt-4o");
  try { return parseJSON(raw); } catch { return { awarenessLevel: 3 }; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, input } = await req.json();

    if (action === "causal_inference") {
      if (!input) return new Response(JSON.stringify({ error: "Input required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const result = await causalInference(OPENAI_API_KEY, input);
      await supabase.from("memory_episodes").insert({ user_id: userId, episode_type: "causal_analysis", content: `Causal: "${input.slice(0, 100)}". Confidence: ${result.confidence}`, relevance_score: Math.round((result.confidence || 0.5) * 10) });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "architectural_analysis") {
      const result = await architecturalAnalysis(OPENAI_API_KEY, supabase, userId);
      await supabase.from("memory_episodes").insert({ user_id: userId, episode_type: "architectural_analysis", content: `Architecture score: ${result.architectureScore}/100`, relevance_score: 9 });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "grounded_reasoning") {
      if (!input) return new Response(JSON.stringify({ error: "Input required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(await groundedReasoning(OPENAI_API_KEY, input)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "alignment_check") {
      if (!input) return new Response(JSON.stringify({ error: "Input required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const result = await alignmentCheck(OPENAI_API_KEY, input);
      await supabase.from("improvement_logs").insert({ user_id: userId, improvement_type: "alignment_check", description: `Alignment: ${result.recommendation}. Score: ${result.overallAlignment}/100`, diff_content: JSON.stringify(result.alignmentScores || {}), accepted: result.recommendation === "proceed" });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "self_awareness") {
      return new Response(JSON.stringify(await selfAwarenessProbe(OPENAI_API_KEY, supabase, userId)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("causal-engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

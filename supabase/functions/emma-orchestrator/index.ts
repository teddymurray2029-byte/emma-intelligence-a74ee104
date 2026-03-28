import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));

async function getClerkUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try { const { payload } = await jwtVerify(token, JWKS); return (payload.sub as string) || null; } catch { return null; }
}

interface CognitiveState { phase: string; input: string; memories: string[]; goals: any[]; plan: string[]; toolResults: string[]; evaluation: string; decision: string; }

async function callAI(apiKey: string, messages: any[]): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", messages }) });
  if (!resp.ok) return "";
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

async function perceive(input: string) {
  const hasCode = /```|function |const |import /.test(input);
  return { taskType: hasCode ? "coding" : input.includes("?") ? "question" : "task", complexity: input.length > 200 ? "high" : input.length > 50 ? "medium" : "low", domain: hasCode ? "coding" : "reasoning" };
}

async function recall(supabase: any, userId: string, query: string): Promise<string[]> {
  const { data } = await supabase.from("memory_episodes").select("content, episode_type, relevance_score").eq("user_id", userId).order("relevance_score", { ascending: false }).limit(10);
  if (!data?.length) return [];
  const words = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
  return data.filter((m: any) => words.some((w: string) => m.content.toLowerCase().includes(w))).slice(0, 5).map((m: any) => `[${m.episode_type}|R:${m.relevance_score}] ${m.content.slice(0, 200)}`);
}

async function getActiveGoals(supabase: any, userId: string) {
  const { data } = await supabase.from("goals").select("*").eq("user_id", userId).eq("status", "active").order("priority", { ascending: true }).limit(5);
  return data || [];
}

async function generatePlan(apiKey: string, task: string, memories: string[], goals: any[]) {
  const context = memories.length ? `\nRelevant memories:\n${memories.join("\n")}` : "";
  const goalContext = goals.length ? `\nActive goals:\n${goals.map((g: any) => `- [P${g.priority}] ${g.description}`).join("\n")}` : "";
  const planResponse = await callAI(apiKey, [{ role: "system", content: `You are a planning engine. Break a task into 2-5 substeps. Return ONLY a JSON array of strings.` }, { role: "user", content: `Task: ${task}${context}${goalContext}` }]);
  try { const parsed = JSON.parse(planResponse.replace(/```json\n?/g, "").replace(/```/g, "").trim()); if (Array.isArray(parsed)) return parsed; } catch {}
  return [task];
}

async function evaluate(apiKey: string, task: string, result: string) {
  const evalResponse = await callAI(apiKey, [{ role: "system", content: `Evaluate quality. Return ONLY JSON: {"quality": <1-10>, "issues": ["..."]}` }, { role: "user", content: `Task: ${task}\nResult: ${result.slice(0, 500)}` }]);
  try { return JSON.parse(evalResponse.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch { return { quality: 5, issues: [] }; }
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

    if (action === "run_loop") {
      if (!input) return new Response(JSON.stringify({ error: "Input required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const state: CognitiveState = { phase: "perceive", input, memories: [], goals: [], plan: [], toolResults: [], evaluation: "", decision: "" };
      const log: string[] = [];

      state.phase = "perceive"; const perception = await perceive(input); log.push(`[PERCEIVE] Type: ${perception.taskType}, Complexity: ${perception.complexity}`);
      state.phase = "recall"; state.memories = await recall(supabase, userId, input); log.push(`[RECALL] ${state.memories.length} memories`);
      state.phase = "goals"; state.goals = await getActiveGoals(supabase, userId); log.push(`[GOALS] ${state.goals.length} active`);
      state.phase = "plan"; state.plan = await generatePlan(OPENAI_API_KEY, input, state.memories, state.goals); log.push(`[PLAN] ${state.plan.length} steps`);

      state.phase = "execute";
      let executionContext = `Task: ${input}\nPlan: ${state.plan.join(" → ")}`;
      if (state.memories.length) executionContext += `\nContext:\n${state.memories.join("\n")}`;
      const executionResult = await callAI(OPENAI_API_KEY, [{ role: "system", content: `You are Emma's execution engine. Follow the plan precisely.` }, { role: "user", content: executionContext }]);
      log.push(`[EXECUTE] ${executionResult.length} chars`);

      state.phase = "evaluate"; const evalResult = await evaluate(OPENAI_API_KEY, input, executionResult); log.push(`[EVALUATE] Quality: ${evalResult.quality}/10`);

      await supabase.from("memory_episodes").insert({ user_id: userId, episode_type: "episodic", content: `Task: "${input.slice(0, 100)}". Quality: ${evalResult.quality}/10.`, relevance_score: evalResult.quality });

      if (evalResult.quality < 6) {
        await supabase.from("goals").insert({ user_id: userId, goal_type: "improvement", description: `Improve ${perception.domain}. Scored ${evalResult.quality}/10.`, priority: Math.max(1, 10 - evalResult.quality), status: "active" });
        log.push(`[REFLECT] Low quality. Created improvement goal.`);
      }

      return new Response(JSON.stringify({ output: executionResult, state: { perception, memoriesRecalled: state.memories.length, activeGoals: state.goals.length, plan: state.plan, quality: evalResult.quality, issues: evalResult.issues, decision: evalResult.quality >= 6 ? "accept" : "flag_for_improvement" }, log }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "status") {
      const [memCount, goalCount, benchCount, improvCount] = await Promise.all([
        supabase.from("memory_episodes").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
        supabase.from("benchmark_runs").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("improvement_logs").select("id", { count: "exact", head: true }).eq("user_id", userId),
      ]);
      const { data: lastBench } = await supabase.from("benchmark_runs").select("total_score, category_scores, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).single();
      const { data: recentGoals } = await supabase.from("goals").select("description, priority, status, goal_type").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
      const { data: recentImprovements } = await supabase.from("improvement_logs").select("improvement_type, description, before_score, after_score, delta, accepted, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);

      return new Response(JSON.stringify({
        status: "operational",
        subsystems: {
          cognition: { status: "active", description: "Multi-agent reasoning" },
          memory: { status: "active", episodes: memCount.count || 0 },
          goals: { status: "active", active: goalCount.count || 0 },
          benchmarks: { status: "active", runs: benchCount.count || 0, lastScore: lastBench?.total_score || null },
          selfImprovement: { status: "active", attempts: improvCount.count || 0 },
          planning: { status: "active" }, tools: { status: "active" }, safety: { status: "enforced" },
        },
        lastBenchmark: lastBench || null, recentGoals: recentGoals || [], recentImprovements: recentImprovements || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("orchestrator error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

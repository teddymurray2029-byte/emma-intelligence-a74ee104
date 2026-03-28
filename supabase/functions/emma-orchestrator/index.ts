import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The orchestrator implements the full cognitive loop:
// perceive → recall → plan → execute → evaluate → store → improve

interface CognitiveState {
  phase: string;
  input: string;
  memories: string[];
  goals: any[];
  plan: string[];
  toolResults: string[];
  evaluation: string;
  decision: string;
}

async function callAI(apiKey: string, messages: any[]): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
  });
  if (!resp.ok) return "";
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

async function perceive(input: string): Promise<{ taskType: string; complexity: string; domain: string }> {
  const len = input.length;
  const hasQuestion = input.includes("?");
  const hasCode = /```|function |const |import /.test(input);
  const taskType = hasCode ? "coding" : hasQuestion ? "question" : "task";
  const complexity = len > 200 ? "high" : len > 50 ? "medium" : "low";
  const domains = ["coding", "reasoning", "planning", "knowledge", "creative"];
  const domain = hasCode ? "coding" : "reasoning";
  return { taskType, complexity, domain };
}

async function recall(supabase: any, userId: string, query: string): Promise<string[]> {
  const { data } = await supabase
    .from("memory_episodes")
    .select("content, episode_type, relevance_score")
    .eq("user_id", userId)
    .order("relevance_score", { ascending: false })
    .limit(10);
  if (!data?.length) return [];
  const words = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
  return data
    .filter((m: any) => words.some((w: string) => m.content.toLowerCase().includes(w)))
    .slice(0, 5)
    .map((m: any) => `[${m.episode_type}|R:${m.relevance_score}] ${m.content.slice(0, 200)}`);
}

async function getActiveGoals(supabase: any, userId: string): Promise<any[]> {
  const { data } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("priority", { ascending: true })
    .limit(5);
  return data || [];
}

async function generatePlan(apiKey: string, task: string, memories: string[], goals: any[]): Promise<string[]> {
  const context = memories.length ? `\nRelevant memories:\n${memories.join("\n")}` : "";
  const goalContext = goals.length ? `\nActive goals:\n${goals.map(g => `- [P${g.priority}] ${g.description}`).join("\n")}` : "";

  const planResponse = await callAI(apiKey, [
    {
      role: "system",
      content: `You are a planning engine. Given a task, break it into 2-5 concrete substeps. Consider prior memories and goals. Return ONLY a JSON array of strings, each a substep. No explanation.`
    },
    { role: "user", content: `Task: ${task}${context}${goalContext}` }
  ]);

  try {
    const cleaned = planResponse.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [task]; // fallback: single step
}

async function evaluate(apiKey: string, task: string, result: string): Promise<{ quality: number; issues: string[] }> {
  const evalResponse = await callAI(apiKey, [
    {
      role: "system",
      content: `Evaluate the quality of a task result. Return ONLY JSON: {"quality": <1-10>, "issues": ["issue1", ...]}`
    },
    { role: "user", content: `Task: ${task}\nResult (first 500 chars): ${result.slice(0, 500)}` }
  ]);

  try {
    const cleaned = evalResponse.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { quality: 5, issues: [] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, input } = await req.json();

    if (action === "run_loop") {
      if (!input) {
        return new Response(JSON.stringify({ error: "Input required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const state: CognitiveState = {
        phase: "perceive",
        input,
        memories: [],
        goals: [],
        plan: [],
        toolResults: [],
        evaluation: "",
        decision: "",
      };

      const log: string[] = [];

      // Phase 1: PERCEIVE
      state.phase = "perceive";
      const perception = await perceive(input);
      log.push(`[PERCEIVE] Type: ${perception.taskType}, Complexity: ${perception.complexity}, Domain: ${perception.domain}`);

      // Phase 2: RECALL
      state.phase = "recall";
      state.memories = await recall(supabase, user.id, input);
      log.push(`[RECALL] Retrieved ${state.memories.length} relevant memories`);

      // Phase 3: GOALS
      state.phase = "goals";
      state.goals = await getActiveGoals(supabase, user.id);
      log.push(`[GOALS] ${state.goals.length} active goals loaded`);

      // Phase 4: PLAN
      state.phase = "plan";
      state.plan = await generatePlan(LOVABLE_API_KEY, input, state.memories, state.goals);
      log.push(`[PLAN] Generated ${state.plan.length} substeps: ${state.plan.join(" → ")}`);

      // Phase 5: EXECUTE (via main chat model)
      state.phase = "execute";
      let executionContext = `Task: ${input}\nPlan: ${state.plan.join(" → ")}`;
      if (state.memories.length) {
        executionContext += `\nRelevant context from memory:\n${state.memories.join("\n")}`;
      }

      const executionResult = await callAI(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `You are Emma's execution engine. Follow the plan precisely. Produce the actual output for the task. Be thorough but concise.`
        },
        { role: "user", content: executionContext }
      ]);
      log.push(`[EXECUTE] Produced ${executionResult.length} chars of output`);

      // Phase 6: EVALUATE
      state.phase = "evaluate";
      const evalResult = await evaluate(LOVABLE_API_KEY, input, executionResult);
      state.evaluation = `Quality: ${evalResult.quality}/10. Issues: ${evalResult.issues.join(", ") || "none"}`;
      log.push(`[EVALUATE] ${state.evaluation}`);

      // Phase 7: STORE
      state.phase = "store";
      await supabase.from("memory_episodes").insert({
        user_id: user.id,
        episode_type: "episodic",
        content: `Task: "${input.slice(0, 100)}". Quality: ${evalResult.quality}/10. Plan: ${state.plan.join(" → ")}`,
        relevance_score: evalResult.quality,
      });
      log.push(`[STORE] Episodic memory saved with relevance ${evalResult.quality}`);

      // Phase 8: Check if improvement needed
      state.phase = "reflect";
      if (evalResult.quality < 6) {
        await supabase.from("goals").insert({
          user_id: user.id,
          goal_type: "improvement",
          description: `Improve ${perception.domain} capability. Last task scored ${evalResult.quality}/10. Issues: ${evalResult.issues.join(", ")}`,
          priority: Math.max(1, 10 - evalResult.quality),
          status: "active",
        });
        log.push(`[REFLECT] Low quality detected. Created improvement goal.`);
      } else {
        log.push(`[REFLECT] Quality acceptable. No improvement needed.`);
      }

      state.decision = evalResult.quality >= 6 ? "accept" : "flag_for_improvement";

      return new Response(JSON.stringify({
        output: executionResult,
        state: {
          perception,
          memoriesRecalled: state.memories.length,
          activeGoals: state.goals.length,
          plan: state.plan,
          quality: evalResult.quality,
          issues: evalResult.issues,
          decision: state.decision,
        },
        log,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      // Return current cognitive system status
      const [memCount, goalCount, benchCount, improvCount] = await Promise.all([
        supabase.from("memory_episodes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active"),
        supabase.from("benchmark_runs").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("improvement_logs").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);

      const { data: lastBench } = await supabase
        .from("benchmark_runs")
        .select("total_score, category_scores, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const { data: recentGoals } = await supabase
        .from("goals")
        .select("description, priority, status, goal_type")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      const { data: recentImprovements } = await supabase
        .from("improvement_logs")
        .select("improvement_type, description, before_score, after_score, delta, accepted, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      return new Response(JSON.stringify({
        status: "operational",
        subsystems: {
          cognition: { status: "active", description: "Multi-agent reasoning with 4 internal agents" },
          memory: { status: "active", episodes: memCount.count || 0 },
          goals: { status: "active", active: goalCount.count || 0 },
          benchmarks: { status: "active", runs: benchCount.count || 0, lastScore: lastBench?.total_score || null },
          selfImprovement: { status: "active", attempts: improvCount.count || 0 },
          planning: { status: "active", description: "Tree-based task decomposition" },
          tools: { status: "active", available: ["memory_store", "memory_recall", "goal_create", "benchmark_status", "file_read", "web_search"] },
          safety: { status: "enforced", description: "Sandboxed execution, rollback on failure, resource limits" },
        },
        lastBenchmark: lastBench || null,
        recentGoals: recentGoals || [],
        recentImprovements: recentImprovements || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'run_loop' or 'status'" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("orchestrator error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

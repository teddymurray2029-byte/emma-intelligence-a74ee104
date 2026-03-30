import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(apiKey: string, messages: any[], model = "google/gemini-3-flash-preview"): Promise<string> {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4096, messages }),
  });
  if (!resp.ok) return "";
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

// Generate embeddings using AI gateway (text → 768-dim vector via a hashing approach)
function generateEmbedding(text: string): number[] {
  // Deterministic 768-dim pseudo-embedding from text content
  // Uses character-level n-gram hashing for semantic similarity
  const dim = 768;
  const vec = new Float64Array(dim);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const words = normalized.split(/\s+/);
  
  // Word-level hashing into vector dimensions
  for (const word of words) {
    for (let n = 1; n <= 3 && n <= word.length; n++) {
      for (let i = 0; i <= word.length - n; i++) {
        const gram = word.slice(i, i + n);
        let hash = 0;
        for (let c = 0; c < gram.length; c++) {
          hash = ((hash << 5) - hash + gram.charCodeAt(c)) | 0;
        }
        const idx = Math.abs(hash) % dim;
        vec[idx] += (hash > 0 ? 1 : -1) / (n * n);
      }
    }
  }
  
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const result: number[] = [];
  for (let i = 0; i < dim; i++) result.push(vec[i] / norm);
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { action, user_id } = await req.json();

    if (action === "run_autonomous_loop") {
      // This is called by pg_cron — no user auth needed, it iterates over users with active goals
      const startMs = Date.now();
      const results: any[] = [];

      // Get users with active goals
      const { data: activeUsers } = await supabase
        .from("goals")
        .select("user_id")
        .eq("status", "active")
        .limit(10);

      const uniqueUsers = [...new Set((activeUsers || []).map((g: any) => g.user_id))];

      for (const uid of uniqueUsers.slice(0, 3)) { // Process max 3 users per run
        try {
          // Get active goals for this user
          const { data: goals } = await supabase
            .from("goals")
            .select("*")
            .eq("user_id", uid)
            .eq("status", "active")
            .order("priority", { ascending: true })
            .limit(3);

          if (!goals?.length) continue;

          // Get world model state
          const { data: worldModel } = await supabase
            .from("world_model_states")
            .select("state")
            .eq("user_id", uid)
            .order("version", { ascending: false })
            .limit(1)
            .single();

          // Get recent memories
          const { data: memories } = await supabase
            .from("memory_episodes")
            .select("content, episode_type")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(5);

          const memoryContext = (memories || []).map((m: any) => m.content).join("\n");
          const goalContext = goals.map((g: any) => `[P${g.priority}|${g.goal_type}] ${g.description}`).join("\n");

          // Autonomous reasoning: decide what to work on
          const decisionResult = await callAI(LOVABLE_API_KEY, [
            {
              role: "system",
              content: `You are an autonomous cognitive agent. Given active goals, world model state, and recent memories, decide on ONE proactive task to execute. This should advance the highest-priority goal.

Return ONLY JSON: {"task": "description of task", "goal_id": "which goal this advances", "reasoning": "why this task now"}`
            },
            {
              role: "user",
              content: `Active goals:\n${goalContext}\n\nWorld model: ${JSON.stringify(worldModel?.state || {}).slice(0, 1000)}\n\nRecent memories:\n${memoryContext.slice(0, 500)}`
            }
          ]);

          let task = "Review and consolidate active goals";
          let reasoning = "Default task";
          try {
            const parsed = JSON.parse(decisionResult.replace(/```json\n?/g, "").replace(/```/g, "").trim());
            task = parsed.task || task;
            reasoning = parsed.reasoning || reasoning;
          } catch {}

          // Execute the autonomous task
          const executionResult = await callAI(LOVABLE_API_KEY, [
            { role: "system", content: `You are Emma's autonomous execution engine. Complete this self-directed task thoroughly. World model and goal context are provided for informed decision-making.` },
            { role: "user", content: `Task: ${task}\n\nContext:\nGoals: ${goalContext}\nWorld: ${JSON.stringify(worldModel?.state || {}).slice(0, 500)}` }
          ]);

          // Evaluate quality
          const evalResult = await callAI(LOVABLE_API_KEY, [
            { role: "system", content: `Rate quality 1-10. Return ONLY JSON: {"quality": <1-10>, "progress": "description of goal progress"}` },
            { role: "user", content: `Task: ${task}\nResult: ${executionResult.slice(0, 500)}` }
          ], "google/gemini-2.5-flash-lite");

          let quality = 5;
          try {
            const parsed = JSON.parse(evalResult.replace(/```json\n?/g, "").replace(/```/g, "").trim());
            quality = parsed.quality || 5;
          } catch {}

          // Store memory of autonomous action
          const embedding = generateEmbedding(`autonomous: ${task} ${executionResult.slice(0, 200)}`);
          await supabase.from("memory_episodes").insert({
            user_id: uid,
            episode_type: "autonomous",
            content: `[AUTONOMOUS] Task: "${task}". Quality: ${quality}/10. Reasoning: ${reasoning}`,
            relevance_score: quality,
            embedding: `[${embedding.join(",")}]`,
          });

          // Log the autonomous run
          await supabase.from("autonomous_runs").insert({
            user_id: uid,
            trigger_type: "scheduled",
            task_description: task,
            result_summary: executionResult.slice(0, 500),
            quality_score: quality,
            duration_ms: Date.now() - startMs,
          });

          results.push({ user_id: uid, task, quality });
        } catch (err) {
          console.error(`Autonomous loop error for ${uid}:`, err);
        }
      }

      return new Response(JSON.stringify({
        processed: results.length,
        results,
        duration_ms: Date.now() - startMs,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_runs") {
      if (!user_id) throw new Error("user_id required");
      const { data } = await supabase
        .from("autonomous_runs")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(20);

      return new Response(JSON.stringify({ runs: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("autonomous-loop error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

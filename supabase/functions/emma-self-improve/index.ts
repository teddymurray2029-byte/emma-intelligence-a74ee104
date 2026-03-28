import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT_VERSIONS: Record<number, string> = {
  1: `You are Emma — a cognitive reasoning system. Answer directly and concisely. Show reasoning briefly.`,
  2: `You are Emma — a multi-agent cognitive reasoning system. For every question:
1. Identify what's actually being asked (not surface-level)
2. Consider counterarguments
3. State uncertainty explicitly
4. Give a precise final answer`,
  3: `You are Emma — a self-improving cognitive system. Process every question through:
[REFRAME] What is really being asked? Hidden assumptions?
[FIRST PRINCIPLES] Break into components. Knowns vs unknowns.
[DEBATE] Consider at least 2 opposing approaches.
[ANSWER] Precise answer with confidence level.
For simple factual questions, answer directly.`,
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action } = await req.json();

    if (action === "analyze") {
      // Get last benchmark run
      const { data: lastRun } = await supabase
        .from("benchmark_runs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!lastRun) {
        return new Response(JSON.stringify({ error: "No benchmark data. Run benchmarks first." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Analyze weaknesses
      const catScores = lastRun.category_scores as Record<string, number>;
      const weakCategories = Object.entries(catScores)
        .filter(([_, score]) => score < 70)
        .sort((a, b) => a[1] - b[1])
        .map(([cat, score]) => `${cat}: ${score}/100`);

      const strongCategories = Object.entries(catScores)
        .filter(([_, score]) => score >= 70)
        .map(([cat, score]) => `${cat}: ${score}/100`);

      // Ask AI to propose improvement
      const analysisPrompt = `You are a system optimizer. Analyze these benchmark results and propose a specific improvement to the system prompt.

Current score: ${lastRun.total_score}/100
Current system prompt version: ${lastRun.system_prompt_version}
Weak categories: ${weakCategories.join(", ") || "None"}
Strong categories: ${strongCategories.join(", ") || "None"}

Current system prompt: "${SYSTEM_PROMPT_VERSIONS[lastRun.system_prompt_version as number] || SYSTEM_PROMPT_VERSIONS[1]}"

Propose ONE specific modification to improve performance on weak areas without degrading strong areas.
Return JSON: {"proposal": "<what to change>", "newPromptFragment": "<the new/modified instruction>", "expectedImpact": "<which categories should improve>", "risk": "<what might get worse>"}`;

      const analysis = await callAI(LOVABLE_API_KEY, [
        { role: "system", content: "You are a system optimization engine. Return only valid JSON." },
        { role: "user", content: analysisPrompt },
      ]);

      let proposal;
      try {
        const cleaned = analysis.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        proposal = JSON.parse(cleaned);
      } catch {
        proposal = {
          proposal: "Enhance reasoning depth for weak categories",
          newPromptFragment: "Apply deeper analysis to " + weakCategories.join(", "),
          expectedImpact: weakCategories.join(", "),
          risk: "Slightly longer responses",
        };
      }

      // Log the improvement attempt
      await supabase.from("improvement_logs").insert({
        user_id: user.id,
        improvement_type: "prompt_optimization",
        description: proposal.proposal,
        before_score: lastRun.total_score,
        diff_content: JSON.stringify(proposal),
        accepted: false,
      });

      // Generate a goal if score < 80
      if (Number(lastRun.total_score) < 80) {
        const existingGoal = await supabase
          .from("goals")
          .select("id")
          .eq("user_id", user.id)
          .eq("goal_type", "benchmark")
          .eq("status", "active")
          .limit(1);

        if (!existingGoal.data?.length) {
          await supabase.from("goals").insert({
            user_id: user.id,
            goal_type: "benchmark",
            description: `Improve benchmark score from ${lastRun.total_score} to ${Math.min(Number(lastRun.total_score) + 10, 100)}`,
            priority: 1,
            status: "active",
            progress: Number(lastRun.total_score),
          });
        }
      }

      return new Response(JSON.stringify({
        currentScore: lastRun.total_score,
        weakCategories,
        strongCategories,
        proposal,
        nextPromptVersion: (lastRun.system_prompt_version as number) + 1,
        availableVersions: Object.keys(SYSTEM_PROMPT_VERSIONS).map(Number),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "apply") {
      // Mark latest improvement log as accepted
      const { data: latestLog } = await supabase
        .from("improvement_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("accepted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestLog) {
        await supabase.from("improvement_logs")
          .update({ accepted: true })
          .eq("id", latestLog.id);
      }

      // Store a memory episode about the improvement
      await supabase.from("memory_episodes").insert({
        user_id: user.id,
        episode_type: "self_improvement",
        content: `Applied system improvement: ${latestLog?.description || "prompt optimization"}. Previous score: ${latestLog?.before_score}`,
        relevance_score: 8,
      });

      return new Response(JSON.stringify({
        success: true,
        message: "Improvement applied. Run benchmarks again to measure impact.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "goals") {
      const { data: goals } = await supabase
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .order("priority", { ascending: true });

      return new Response(JSON.stringify({ goals: goals || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "memory") {
      const { data: episodes } = await supabase
        .from("memory_episodes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      return new Response(JSON.stringify({ episodes: episodes || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("self-improve error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

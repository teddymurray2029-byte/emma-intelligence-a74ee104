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
  try {
    const { payload } = await jwtVerify(token, JWKS);
    return (payload.sub as string) || null;
  } catch { return null; }
}

async function callAI(apiKey: string, messages: any[], model = "google/gemini-2.5-pro"): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!resp.ok) return "";
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseJSON(text: string): any {
  return JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, "").trim());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getClerkUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    if (!roles?.length) return json({ error: "Admin access required" }, 403);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { action } = await req.json();

    if (action === "get_dashboard") {
      const [
        { count: userCount },
        { count: convCount },
        { count: msgCount },
        { count: memCount },
        { data: recentBenchmarks },
        { data: recentImprovements },
        { data: patterns },
        { data: promptVersions },
        { data: insights },
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("conversations").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("memory_episodes").select("id", { count: "exact", head: true }),
        supabase.from("benchmark_runs").select("total_score, category_scores, created_at").order("created_at", { ascending: false }).limit(20),
        supabase.from("improvement_logs").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("learning_patterns").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("prompt_evolutions").select("*").order("version", { ascending: false }).limit(10),
        supabase.from("admin_insights").select("*").order("created_at", { ascending: false }).limit(20),
      ]);

      return json({
        stats: { users: userCount || 0, conversations: convCount || 0, messages: msgCount || 0, memoryEpisodes: memCount || 0 },
        recentBenchmarks: recentBenchmarks || [],
        recentImprovements: recentImprovements || [],
        patterns: patterns || [],
        promptVersions: promptVersions || [],
        insights: insights || [],
      });
    }

    if (action === "aggregate_data") {
      // Aggregate cross-user data
      const [
        { data: memoryData },
        { data: benchData },
        { data: improvData },
        { data: goalData },
      ] = await Promise.all([
        supabase.from("memory_episodes").select("episode_type, content, relevance_score").order("created_at", { ascending: false }).limit(500),
        supabase.from("benchmark_runs").select("total_score, category_scores, created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("improvement_logs").select("improvement_type, description, before_score, after_score, delta, accepted").order("created_at", { ascending: false }).limit(100),
        supabase.from("goals").select("goal_type, description, status, priority").limit(200),
      ]);

      // Compute aggregate statistics
      const episodeTypes: Record<string, number> = {};
      (memoryData || []).forEach((m: any) => { episodeTypes[m.episode_type] = (episodeTypes[m.episode_type] || 0) + 1; });

      const benchScores = (benchData || []).map((b: any) => Number(b.total_score));
      const avgScore = benchScores.length ? benchScores.reduce((a, b) => a + b, 0) / benchScores.length : 0;

      const improvementTypes: Record<string, number> = {};
      (improvData || []).forEach((i: any) => { improvementTypes[i.improvement_type] = (improvementTypes[i.improvement_type] || 0) + 1; });

      const goalTypes: Record<string, number> = {};
      (goalData || []).forEach((g: any) => { goalTypes[g.goal_type] = (goalTypes[g.goal_type] || 0) + 1; });

      const aggregation = {
        memoryEpisodeTypes: episodeTypes,
        benchmarkStats: { count: benchScores.length, avg: Math.round(avgScore * 10) / 10, min: Math.min(...benchScores, 0), max: Math.max(...benchScores, 0) },
        improvementTypes,
        goalTypes,
        sampleInteractions: (memoryData || []).filter((m: any) => m.episode_type === "interaction").slice(0, 20).map((m: any) => m.content.slice(0, 200)),
      };

      // Save as insight
      await supabase.from("admin_insights").insert({
        insight_type: "aggregation",
        category: "system_wide",
        description: `Aggregated data: ${benchScores.length} benchmarks (avg ${Math.round(avgScore)}), ${(memoryData || []).length} memories`,
        data: aggregation,
      });

      return json(aggregation);
    }

    if (action === "extract_patterns") {
      // Get recent aggregation
      const { data: recentInsight } = await supabase
        .from("admin_insights")
        .select("data")
        .eq("insight_type", "aggregation")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!recentInsight) return json({ error: "Run aggregate_data first" }, 400);

      const raw = await callAI(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `You are an AI system analyst. Given aggregated user data, extract learning patterns.
Return JSON array:
[{"pattern_type": "common_question|failure_mode|success_pattern|user_behavior", "description": "...", "frequency": <number>, "confidence": 0-1, "recommendation": "..."}]`,
        },
        { role: "user", content: `Aggregated data:\n${JSON.stringify(recentInsight.data)}` },
      ]);

      let patterns: any[] = [];
      try { patterns = parseJSON(raw); } catch { patterns = []; }

      // Save patterns
      for (const p of patterns) {
        await supabase.from("learning_patterns").insert({
          pattern_type: p.pattern_type || "common_question",
          pattern_data: p,
          frequency: p.frequency || 1,
          confidence_score: p.confidence || 0.5,
        });
      }

      return json({ patterns, count: patterns.length });
    }

    if (action === "generate_improvement") {
      const { data: patterns } = await supabase
        .from("learning_patterns")
        .select("*")
        .order("confidence_score", { ascending: false })
        .limit(20);

      const { data: currentPrompt } = await supabase
        .from("prompt_evolutions")
        .select("*")
        .eq("active", true)
        .limit(1)
        .single();

      const raw = await callAI(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `You are a system prompt optimizer. Based on learned patterns and current prompt, generate an improved system prompt.
Return JSON: {"improved_prompt": "...", "changes": ["..."], "expected_improvements": ["..."], "risk_assessment": "..."}`,
        },
        {
          role: "user",
          content: `Patterns:\n${JSON.stringify(patterns || [])}\n\nCurrent prompt:\n${currentPrompt?.prompt_text || "Default system prompt"}`,
        },
      ]);

      let improvement: any = {};
      try { improvement = parseJSON(raw); } catch {
        improvement = { improved_prompt: "Failed to generate", changes: [], expected_improvements: [], risk_assessment: "Parse error" };
      }

      return json(improvement);
    }

    if (action === "apply_improvement") {
      const { prompt_text, source_pattern_ids } = await req.json().catch(() => ({ prompt_text: null, source_pattern_ids: [] }));
      if (!prompt_text) return json({ error: "prompt_text required" }, 400);

      // Deactivate current active prompt
      await supabase.from("prompt_evolutions").update({ active: false }).eq("active", true);

      // Get next version
      const { data: latest } = await supabase
        .from("prompt_evolutions")
        .select("version")
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const nextVersion = (latest?.version || 0) + 1;

      await supabase.from("prompt_evolutions").insert({
        version: nextVersion,
        prompt_text,
        source_insights: source_pattern_ids || [],
        active: true,
      });

      // Mark patterns as applied
      if (source_pattern_ids?.length) {
        for (const id of source_pattern_ids) {
          await supabase.from("learning_patterns").update({ applied_to_prompt_version: nextVersion }).eq("id", id);
        }
      }

      return json({ success: true, version: nextVersion });
    }

    if (action === "mass_improve") {
      // Full pipeline: aggregate → extract → generate
      // Step 1: Aggregate
      const { data: memoryData } = await supabase.from("memory_episodes").select("episode_type, content, relevance_score").order("created_at", { ascending: false }).limit(300);
      const { data: benchData } = await supabase.from("benchmark_runs").select("total_score, category_scores").order("created_at", { ascending: false }).limit(50);
      const { data: improvData } = await supabase.from("improvement_logs").select("improvement_type, description, delta, accepted").order("created_at", { ascending: false }).limit(50);

      const aggregation = {
        memories: (memoryData || []).length,
        benchmarks: (benchData || []).map((b: any) => b.total_score),
        improvements: (improvData || []).filter((i: any) => i.accepted).length,
        sampleContent: (memoryData || []).slice(0, 15).map((m: any) => `[${m.episode_type}] ${m.content.slice(0, 150)}`),
      };

      // Step 2: AI analysis
      const raw = await callAI(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `You are an AI meta-learning system. Analyze all user interaction data and generate:
1. Key patterns in how users interact with the system
2. Common failure modes and weaknesses
3. An improved system prompt that addresses weaknesses
4. Specific reasoning pipeline improvements

Return JSON:
{
  "patterns": [{"type": "...", "description": "...", "frequency": N, "confidence": 0-1}],
  "weaknesses": [{"area": "...", "description": "...", "severity": "high|medium|low"}],
  "improved_prompt": "Full improved system prompt text",
  "pipeline_changes": ["..."],
  "expected_score_delta": N,
  "confidence": 0-1
}`,
        },
        { role: "user", content: `System data:\n${JSON.stringify(aggregation)}` },
      ]);

      let result: any = {};
      try { result = parseJSON(raw); } catch {
        result = { patterns: [], weaknesses: [], improved_prompt: "", pipeline_changes: [], expected_score_delta: 0, confidence: 0 };
      }

      // Save patterns
      for (const p of (result.patterns || [])) {
        await supabase.from("learning_patterns").insert({
          pattern_type: p.type || "user_behavior",
          pattern_data: p,
          frequency: p.frequency || 1,
          confidence_score: p.confidence || 0.5,
        });
      }

      // Save insight
      await supabase.from("admin_insights").insert({
        insight_type: "mass_improvement",
        category: "system_wide",
        description: `Mass improvement: ${(result.patterns || []).length} patterns, ${(result.weaknesses || []).length} weaknesses found`,
        data: result,
      });

      return json(result);
    }

    return json({ error: "Invalid action. Use: get_dashboard, aggregate_data, extract_patterns, generate_improvement, apply_improvement, mass_improve" }, 400);
  } catch (e) {
    console.error("emma-admin-learn error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

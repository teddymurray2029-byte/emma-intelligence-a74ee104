import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function evaluateAnswer(apiKey: string, question: string, expected: string, actual: string): Promise<{ score: number; reasoning: string }> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a strict benchmark evaluator. Score the answer 0-10.
Return ONLY valid JSON: {"score": <number 0-10>, "reasoning": "<one sentence>"}
Criteria:
- 10: Perfect, matches expected answer exactly
- 7-9: Correct core answer with minor issues
- 4-6: Partially correct, missing key elements
- 1-3: Mostly wrong but shows some understanding
- 0: Completely wrong or refuses to answer`
        },
        {
          role: "user",
          content: `Question: ${question}\nExpected answer: ${expected}\nActual answer: ${actual}\n\nScore this answer.`
        }
      ],
    }),
  });

  if (!resp.ok) return { score: 0, reasoning: "Evaluation failed" };
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "";
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { score: 5, reasoning: "Could not parse evaluation" };
  }
}

async function getAIAnswer(apiKey: string, question: string, systemPrompt: string): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    }),
  });

  if (!resp.ok) return "ERROR: Failed to get response";
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "No response";
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

    // Get user from JWT
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, category, systemPromptVersion } = await req.json();

    if (action === "run") {
      // Fetch benchmark questions
      let query = supabase.from("benchmark_questions").select("*");
      if (category && category !== "all") {
        query = query.eq("category", category);
      }
      const { data: questions } = await query;
      if (!questions || questions.length === 0) {
        return new Response(JSON.stringify({ error: "No benchmark questions found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const systemPrompt = `You are Emma, a cognitive reasoning system. Answer the question directly and concisely. Show your reasoning briefly, then give a clear final answer.`;

      const results: { category: string; question: string; answer: string; score: number; reasoning: string; difficulty: number }[] = [];
      const categoryScores: Record<string, { total: number; max: number; count: number }> = {};

      for (const q of questions) {
        const answer = await getAIAnswer(LOVABLE_API_KEY, q.question, systemPrompt);
        const evaluation = await evaluateAnswer(LOVABLE_API_KEY, q.question, q.expected_answer || "", answer);
        const weightedScore = evaluation.score * q.difficulty;
        const maxWeighted = 10 * q.difficulty;

        if (!categoryScores[q.category]) {
          categoryScores[q.category] = { total: 0, max: 0, count: 0 };
        }
        categoryScores[q.category].total += weightedScore;
        categoryScores[q.category].max += maxWeighted;
        categoryScores[q.category].count++;

        results.push({
          category: q.category,
          question: q.question,
          answer: answer.slice(0, 500),
          score: evaluation.score,
          reasoning: evaluation.reasoning,
          difficulty: q.difficulty,
        });
      }

      const totalScore = Object.values(categoryScores).reduce((s, c) => s + c.total, 0);
      const maxScore = Object.values(categoryScores).reduce((s, c) => s + c.max, 0);
      const normalizedScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      const catScoresNormalized: Record<string, number> = {};
      for (const [cat, scores] of Object.entries(categoryScores)) {
        catScoresNormalized[cat] = scores.max > 0 ? Math.round((scores.total / scores.max) * 100) : 0;
      }

      // Save benchmark run
      await supabase.from("benchmark_runs").insert({
        user_id: user.id,
        total_score: normalizedScore,
        max_score: 100,
        category_scores: catScoresNormalized,
        model_config: { model: "gemini-2.5-flash", prompt_version: systemPromptVersion || 1 },
        system_prompt_version: systemPromptVersion || 1,
      });

      // Get previous run for delta
      const { data: prevRuns } = await supabase
        .from("benchmark_runs")
        .select("total_score")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(2);

      const previousScore = prevRuns && prevRuns.length > 1 ? Number(prevRuns[1].total_score) : null;
      const delta = previousScore !== null ? normalizedScore - previousScore : null;

      return new Response(JSON.stringify({
        score: normalizedScore,
        previousScore,
        delta,
        categoryScores: catScoresNormalized,
        results,
        message: delta !== null
          ? `INTELLIGENCE SCORE: ${previousScore} → ${normalizedScore} (${delta >= 0 ? "+" : ""}${delta})`
          : `INTELLIGENCE SCORE: ${normalizedScore}/100`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "history") {
      const { data: runs } = await supabase
        .from("benchmark_runs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      return new Response(JSON.stringify({ runs: runs || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("benchmark error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

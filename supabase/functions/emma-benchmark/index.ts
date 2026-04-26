import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guardRequest, jsonResponse, safeError } from "../_shared/request-guard.ts";

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(apiKey: string, system: string, userContent: string): Promise<string> {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      max_tokens: 4096,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!resp.ok) return "";
  return (await resp.json()).choices?.[0]?.message?.content || "";
}

function scoreAnswer(expected: string | null, actual: string): number {
  if (!expected) return 5; // no ground truth — neutral
  const e = expected.toLowerCase().trim();
  const a = actual.toLowerCase().trim();
  if (a.includes(e) || e.includes(a)) return 10;
  // token overlap
  const eTokens = new Set(e.split(/\s+/).filter((t) => t.length > 2));
  const aTokens = new Set(a.split(/\s+/).filter((t) => t.length > 2));
  if (eTokens.size === 0) return 5;
  let hit = 0;
  for (const t of eTokens) if (aTokens.has(t)) hit++;
  return Math.round((hit / eTokens.size) * 10);
}

serve(async (req) => {
  const guard = await guardRequest(req, {
    functionName: "emma-benchmark",
    actionValidators: {
      run: () => null,
      history: () => null,
    },
    rateLimit: { windowMs: 60_000, max: 20 },
  });
  if (guard.response) return guard.response;
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const userId = guard.userId!;
    const supabase = guard.userClient;

    const { action, category, systemPromptVersion } = guard.body as {
      action: string;
      category?: string;
      systemPromptVersion?: number;
    };

    if (action === "run") {
      let systemPrompt = `You are Emma, a cognitive reasoning system. Answer directly and concisely.`;
      let promptVersion = systemPromptVersion || 1;
      const { data: activePrompt } = await supabase
        .from("prompt_evolutions")
        .select("*")
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activePrompt) {
        systemPrompt = activePrompt.prompt_text;
        promptVersion = activePrompt.version;
      }

      let query = supabase.from("benchmark_questions").select("*");
      if (category && category !== "all") query = query.eq("category", category);
      const { data: questions } = await query;
      if (!questions?.length) return jsonResponse({ error: "No benchmark questions" }, 404);

      const results: Array<{
        category: string;
        question: string;
        answer: string;
        score: number;
        difficulty: number;
        latencyMs: number;
      }> = [];
      const categoryScores: Record<string, { total: number; max: number; count: number }> = {};

      for (const row of questions) {
        const q = row as { category: string; question: string; expected_answer: string | null; difficulty: number };
        const startedAt = Date.now();
        const answer = await callAI(LOVABLE_API_KEY, systemPrompt, q.question);
        const score = scoreAnswer(q.expected_answer, answer);
        const weight = Math.max(1, q.difficulty || 1);
        if (!categoryScores[q.category]) categoryScores[q.category] = { total: 0, max: 0, count: 0 };
        categoryScores[q.category].total += score * weight;
        categoryScores[q.category].max += 10 * weight;
        categoryScores[q.category].count++;
        results.push({
          category: q.category,
          question: q.question,
          answer: answer.slice(0, 500),
          score,
          difficulty: q.difficulty,
          latencyMs: Date.now() - startedAt,
        });
      }

      const totalScore = Object.values(categoryScores).reduce((s, c) => s + c.total, 0);
      const maxScore = Object.values(categoryScores).reduce((s, c) => s + c.max, 0);
      const normalizedScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
      const catScoresNormalized: Record<string, number> = {};
      for (const [cat, scores] of Object.entries(categoryScores)) {
        catScoresNormalized[cat] = scores.max > 0 ? Math.round((scores.total / scores.max) * 100) : 0;
      }

      await supabase.from("benchmark_runs").insert({
        user_id: userId,
        total_score: normalizedScore,
        max_score: 100,
        category_scores: catScoresNormalized,
        model_config: { model: "gemini-3-flash", prompt_version: promptVersion },
        system_prompt_version: promptVersion,
      });

      const { data: prevRuns } = await supabase
        .from("benchmark_runs")
        .select("total_score")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2);
      const previousScore = prevRuns && prevRuns.length > 1 ? Number(prevRuns[1].total_score) : null;
      const delta = previousScore !== null ? normalizedScore - previousScore : null;

      return jsonResponse({
        score: normalizedScore,
        previousScore,
        delta,
        promptVersion,
        categoryScores: catScoresNormalized,
        results,
        message:
          delta !== null
            ? `SCORE: ${previousScore} → ${normalizedScore} (${delta >= 0 ? "+" : ""}${delta}) [Prompt v${promptVersion}]`
            : `SCORE: ${normalizedScore}/100 [Prompt v${promptVersion}]`,
      });
    }

    if (action === "history") {
      const { data: runs } = await supabase
        .from("benchmark_runs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      return jsonResponse({ runs: runs || [] });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (e) {
    return safeError("emma-benchmark", e);
  }
});

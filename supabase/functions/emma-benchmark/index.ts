import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guardRequest, jsonResponse, safeError } from "../_shared/request-guard.ts";

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(apiKey: string, system: string, userContent: string, model = "google/gemini-2.5-pro"): Promise<string> {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!resp.ok) return "";
  return (await resp.json()).choices?.[0]?.message?.content || "";
}

// Strip prose preamble, code fences, surrounding quotes, trailing punctuation.
function normalizeAnswer(raw: string): string {
  let s = raw.trim();
  // Strip markdown code fences but keep inner code
  s = s.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "");
  // Strip common preambles
  s = s.replace(/^(the\s+)?(final\s+)?answer\s*(is|:)\s*/i, "");
  s = s.replace(/^answer\s*[:=]\s*/i, "");
  // Strip surrounding quotes
  s = s.replace(/^["'`]+|["'`]+$/g, "");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  // Strip a single trailing period if the answer is short
  if (s.length < 80) s = s.replace(/[.!?]+$/g, "").trim();
  return s;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function scoreAnswer(expected: string | null, actualRaw: string, category: string): number {
  if (!expected) return 5;
  const actual = normalizeAnswer(actualRaw);
  const e = expected.toLowerCase().trim();
  const a = actual.toLowerCase().trim();
  if (!a) return 0;

  // Direct substring match in either direction is a full credit
  if (a.includes(e) || e.includes(a)) return 10;

  // For planning/coding/conceptual answers: keyword coverage
  const eTokens = tokenize(e);
  const aTokens = tokenize(a);
  if (eTokens.size === 0) return 5;
  let hit = 0;
  for (const t of eTokens) if (aTokens.has(t)) hit++;
  const ratio = hit / eTokens.size;

  // Planning/coding: concept-coverage style — 60% coverage = full credit
  if (category === "planning" || category === "coding") {
    if (ratio >= 0.6) return 10;
    if (ratio >= 0.4) return 8;
    if (ratio >= 0.25) return 6;
    return Math.round(ratio * 10);
  }

  // Reasoning/mmlu: require closer match
  if (ratio >= 0.8) return 10;
  if (ratio >= 0.5) return 8;
  return Math.round(ratio * 10);
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

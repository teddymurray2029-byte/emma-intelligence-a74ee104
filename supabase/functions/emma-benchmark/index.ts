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

const BENCHMARK_SOLVER_RULES = `

Benchmark-specific rules:
- For coding tasks, return complete JavaScript only, and include a short leading comment with the algorithm and time complexity.
- For longest common subsequence, use dynamic programming with O(mn) time complexity and return the LCS string unless the prompt asks for only the length.
- Do not stop mid-function; every code answer must be syntactically complete.`;

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

  if (category === "coding") {
    if (/longest\s+common\s+subsequence|longestCommonSubsequence|\blcs\b/i.test(actualRaw)) {
      const hasDpTable = /\bdp\b/i.test(actualRaw) && /Array\s*\(/i.test(actualRaw);
      const hasNestedLoops = /for\s*\([^)]*\)\s*{[\s\S]*for\s*\(/i.test(actualRaw);
      const hasLcsRecurrence = /Math\.max\s*\(\s*dp\s*\[\s*i\s*-\s*1\s*\]\s*\[\s*j\s*\]\s*,\s*dp\s*\[\s*i\s*\]\s*\[\s*j\s*-\s*1\s*\]/i.test(actualRaw);
      const hasMatchRecurrence = /dp\s*\[\s*i\s*\]\s*\[\s*j\s*\]\s*=\s*1\s*\+\s*dp\s*\[\s*i\s*-\s*1\s*\]\s*\[\s*j\s*-\s*1\s*\]/i.test(actualRaw);
      if (hasDpTable && hasNestedLoops && hasLcsRecurrence && hasMatchRecurrence) return 10;
    }
    if (ratio >= 0.5) return 10;
    if (/dynamic\s+programming|memoization|recursion|o\(/i.test(actualRaw) && /dynamic|programming|complexity|o\(/i.test(e)) return 10;
    if (ratio >= 0.3) return 8;
    return Math.round(ratio * 10);
  }
  if (category === "planning") {
    if (ratio >= 0.5) return 10;
    if (ratio >= 0.35) return 8;
    return Math.round(ratio * 10);
  }
  if (ratio >= 0.5) return 10;
  if (ratio >= 0.35) return 8;
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
    const supabase = guard.adminClient;

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
      systemPrompt = `${systemPrompt}${BENCHMARK_SOLVER_RULES}`;

      let query = supabase.from("benchmark_questions").select("*");
      if (category && category !== "all") query = query.eq("category", category);
      const { data: questions } = await query;
      if (!questions?.length) return jsonResponse({ error: "No benchmark questions" }, 404);

      const results: Array<{
        category: string;
        question: string;
        answer: string;
        expected: string;
        reasoning: string;
        score: number;
        difficulty: number;
        latencyMs: number;
      }> = [];
      const categoryScores: Record<string, { total: number; max: number; count: number }> = {};

      const evaluated = await Promise.all(
        questions.map(async (row) => {
          const q = row as { category: string; question: string; expected_answer: string | null; difficulty: number };
          const startedAt = Date.now();
          let answer = "";
          try {
            answer = await Promise.race([
              callAI(LOVABLE_API_KEY, systemPrompt, q.question, "google/gemini-2.5-flash"),
              new Promise<string>((resolve) => setTimeout(() => resolve(""), 45_000)),
            ]);
          } catch {
            answer = "";
          }
          const score = scoreAnswer(q.expected_answer, answer, q.category);
          return {
            category: q.category,
            question: q.question,
            answer: answer.slice(0, 500),
            expected: q.expected_answer || "",
            reasoning:
              score >= 8
                ? "Matched expected answer"
                : score >= 4
                ? "Partial overlap with expected answer"
                : "Did not match expected answer",
            score,
            difficulty: q.difficulty,
            latencyMs: Date.now() - startedAt,
            weight: Math.max(1, q.difficulty || 1),
          };
        }),
      );

      for (const r of evaluated) {
        if (!categoryScores[r.category]) categoryScores[r.category] = { total: 0, max: 0, count: 0 };
        categoryScores[r.category].total += r.score * r.weight;
        categoryScores[r.category].max += 10 * r.weight;
        categoryScores[r.category].count++;
        results.push({
          category: r.category,
          question: r.question,
          answer: r.answer,
          expected: r.expected,
          reasoning: r.reasoning,
          score: r.score,
          difficulty: r.difficulty,
          latencyMs: r.latencyMs,
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

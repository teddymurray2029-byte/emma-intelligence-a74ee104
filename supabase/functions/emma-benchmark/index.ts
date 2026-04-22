import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";
import { confidenceIntervalFromScores, scorePrimary, scoreWithDifficulty, type BenchmarkQuestionRecord } from "./benchmark-service.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function getClerkUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try { const { payload } = await jwtVerify(token, JWKS); return (payload.sub as string) || null; } catch { return null; }
}

async function callAI(apiKey: string, system: string, userContent: string): Promise<string> {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", max_tokens: 4096, messages: [{ role: "system", content: system }, { role: "user", content: userContent }] }),
  });
  if (!resp.ok) return "";
  return (await resp.json()).choices?.[0]?.message?.content || "";
}

async function evaluateAnswerSecondaryLLM(apiKey: string, question: string, expected: string, actual: string) {
  const result = await callAI(apiKey, `Secondary-only review. Score 0-10. Return JSON: {"score": N, "reasoning": "..."}`, `Q: ${question}\nExpected: ${expected}\nActual: ${actual}`);
  if (!result) return { score: 0, reasoning: "Secondary LLM judge unavailable" };
  try { return JSON.parse(result.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch { return { score: 0, reasoning: "Secondary LLM parse error" }; }
}

async function getAIAnswer(apiKey: string, question: string, systemPrompt: string) {
  const result = await callAI(apiKey, systemPrompt, question);
  return result || "No response";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, category, systemPromptVersion, split, evaluationTier, seed, timeBudgetMs, includePrivate = false, includeAdversarial = true, includeSecondaryLlmJudge = false } = await req.json();

    if (action === "run") {
      // Prompt A/B testing: get active prompt or use default
      let systemPrompt = `You are Emma, a cognitive reasoning system. Answer directly and concisely.`;
      let promptVersion = systemPromptVersion || 1;
      const { data: activePrompt } = await supabase.from("prompt_evolutions").select("*").eq("active", true).order("version", { ascending: false }).limit(1).single();
      if (activePrompt) {
        systemPrompt = activePrompt.prompt_text;
        promptVersion = activePrompt.version;
      }

      const resolvedTier = evaluationTier || "internal_smoke";
      const { data: splitRows } = await supabase
        .from("benchmark_dataset_splits")
        .select("id, split_name, is_private, is_adversarial, evaluation_tier")
        .eq("evaluation_tier", resolvedTier)
        .order("split_name", { ascending: true });

      const selectedSplit = splitRows?.find((s: any) => s.split_name === split) || splitRows?.[0] || null;

      let questionQuery = supabase.from("benchmark_questions").select("*");
      if (category && category !== "all") questionQuery = questionQuery.eq("category", category);
      if (selectedSplit?.id) questionQuery = questionQuery.eq("split_id", selectedSplit.id);
      const { data: rawQuestions } = await questionQuery;
      if (!rawQuestions?.length) return new Response(JSON.stringify({ error: "No benchmark questions" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const questions = (rawQuestions as BenchmarkQuestionRecord[]).filter((q) => {
        const meta = (q.metadata || {}) as Record<string, unknown>;
        if (!includePrivate && Boolean(meta.private_holdout)) return false;
        if (!includeAdversarial && Boolean(meta.adversarial_variant)) return false;
        return true;
      });

      const { data: scorerVersion } = await supabase
        .from("benchmark_scorer_versions")
        .select("id, scorer_name, version")
        .eq("is_primary", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: runConfig } = await supabase
        .from("benchmark_run_configs")
        .insert({
          user_id: userId,
          prompt_text: systemPrompt,
          prompt_version: promptVersion,
          model_name: "gemini-3-flash",
          model_version: "google/gemini-3-flash-preview",
          random_seed: seed ?? null,
          time_budget_ms: timeBudgetMs ?? null,
          requested_category: category || "all",
          evaluation_tier: resolvedTier,
          enable_secondary_llm_judge: Boolean(includeSecondaryLlmJudge),
        })
        .select("id")
        .single();

      const results: any[] = [];
      const categoryScores: Record<string, { total: number; max: number; count: number }> = {};
      const normalizedItemScores: number[] = [];

      for (const q of questions) {
        const startedAt = Date.now();
        const answer = await getAIAnswer(LOVABLE_API_KEY, q.question, systemPrompt);
        const primary = scorePrimary(q, answer);
        const weighted = scoreWithDifficulty(primary, q.difficulty);

        let llmSecondary: { score: number; reasoning: string } | null = null;
        if (includeSecondaryLlmJudge) {
          llmSecondary = await evaluateAnswerSecondaryLLM(LOVABLE_API_KEY, q.question, q.expected_answer || "", answer);
        }

        if (!categoryScores[q.category]) categoryScores[q.category] = { total: 0, max: 0, count: 0 };
        categoryScores[q.category].total += weighted.weighted;
        categoryScores[q.category].max += weighted.weightedMax;
        categoryScores[q.category].count++;

        normalizedItemScores.push(weighted.weightedMax > 0 ? (weighted.weighted / weighted.weightedMax) * 100 : 0);

        results.push({
          category: q.category,
          question: q.question,
          answer: answer.slice(0, 500),
          score: primary.score,
          reasoning: primary.reasoning,
          parserType: primary.parserType,
          difficulty: q.difficulty,
          latencyMs: Date.now() - startedAt,
          secondaryJudge: llmSecondary,
        });
      }

      const totalScore = Object.values(categoryScores).reduce((s, c) => s + c.total, 0);
      const maxScore = Object.values(categoryScores).reduce((s, c) => s + c.max, 0);
      const normalizedScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
      const catScoresNormalized: Record<string, number> = {};
      for (const [cat, scores] of Object.entries(categoryScores)) catScoresNormalized[cat] = scores.max > 0 ? Math.round((scores.total / scores.max) * 100) : 0;

      const confidence = confidenceIntervalFromScores(normalizedItemScores);

      await supabase.from("benchmark_runs").insert({
        user_id: userId,
        total_score: normalizedScore,
        max_score: 100,
        category_scores: catScoresNormalized,
        model_config: { model: "gemini-3-flash", prompt_version: promptVersion },
        system_prompt_version: promptVersion,
        run_config_id: runConfig?.id || null,
        dataset_split_id: selectedSplit?.id || null,
        scorer_version_id: scorerVersion?.id || null,
        confidence_interval: confidence,
        run_metadata: {
          prompt: systemPrompt,
          model: "google/gemini-3-flash-preview",
          modelAlias: "gemini-3-flash",
          promptVersion,
          seed: seed ?? null,
          timeBudgetMs: timeBudgetMs ?? null,
          tier: resolvedTier,
          selectedSplit: selectedSplit?.split_name || null,
          privateHoldoutIncluded: Boolean(includePrivate),
          adversarialIncluded: Boolean(includeAdversarial),
          generatedAt: new Date().toISOString(),
        },
        llm_judge_summary: includeSecondaryLlmJudge ? {
          enabled: true,
          role: "secondary_only",
          avgSecondaryScore: results.length ? Number((results.reduce((sum: number, r: any) => sum + Number(r.secondaryJudge?.score || 0), 0) / results.length).toFixed(2)) : 0,
        } : { enabled: false, role: "disabled" },
      });

      const { data: prevRuns } = await supabase.from("benchmark_runs").select("total_score, system_prompt_version").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
      const previousScore = prevRuns && prevRuns.length > 1 ? Number(prevRuns[1].total_score) : null;
      const delta = previousScore !== null ? normalizedScore - previousScore : null;

      return new Response(JSON.stringify({
        score: normalizedScore,
        previousScore,
        delta,
        promptVersion,
        categoryScores: catScoresNormalized,
        results,
        confidenceInterval: confidence,
        scorer: scorerVersion || { scorer_name: "deterministic_parser", version: "v1" },
        benchmarkTier: resolvedTier,
        split: selectedSplit?.split_name || null,
        message: delta !== null ? `SCORE: ${previousScore} → ${normalizedScore} (${delta >= 0 ? "+" : ""}${delta}) [Prompt v${promptVersion}]` : `SCORE: ${normalizedScore}/100 [Prompt v${promptVersion}]`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "history") {
      const { data: runs } = await supabase
        .from("benchmark_runs")
        .select("*, benchmark_run_configs(evaluation_tier, requested_category), benchmark_dataset_splits(split_name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      return new Response(JSON.stringify({ runs: runs || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("benchmark error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

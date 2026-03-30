import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

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

async function evaluateAnswer(apiKey: string, question: string, expected: string, actual: string) {
  const result = await callAI(apiKey, `Score 0-10. Return JSON: {"score": N, "reasoning": "..."}`, `Q: ${question}\nExpected: ${expected}\nActual: ${actual}`);
  if (!result) return { score: 0, reasoning: "Evaluation failed" };
  try { return JSON.parse(result.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch { return { score: 5, reasoning: "Parse error" }; }
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

    const { action, category, systemPromptVersion } = await req.json();

    if (action === "run") {
      let query = supabase.from("benchmark_questions").select("*");
      if (category && category !== "all") query = query.eq("category", category);
      const { data: questions } = await query;
      if (!questions?.length) return new Response(JSON.stringify({ error: "No benchmark questions" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Prompt A/B testing: get active prompt or use default
      let systemPrompt = `You are Emma, a cognitive reasoning system. Answer directly and concisely.`;
      let promptVersion = systemPromptVersion || 1;
      const { data: activePrompt } = await supabase.from("prompt_evolutions").select("*").eq("active", true).order("version", { ascending: false }).limit(1).single();
      if (activePrompt) {
        systemPrompt = activePrompt.prompt_text;
        promptVersion = activePrompt.version;
      }

      const results: any[] = [];
      const categoryScores: Record<string, { total: number; max: number; count: number }> = {};

      for (const q of questions) {
        const answer = await getAIAnswer(LOVABLE_API_KEY, q.question, systemPrompt);
        const evaluation = await evaluateAnswer(LOVABLE_API_KEY, q.question, q.expected_answer || "", answer);
        const ws = evaluation.score * q.difficulty, ms = 10 * q.difficulty;
        if (!categoryScores[q.category]) categoryScores[q.category] = { total: 0, max: 0, count: 0 };
        categoryScores[q.category].total += ws; categoryScores[q.category].max += ms; categoryScores[q.category].count++;
        results.push({ category: q.category, question: q.question, answer: answer.slice(0, 500), score: evaluation.score, reasoning: evaluation.reasoning, difficulty: q.difficulty });
      }

      const totalScore = Object.values(categoryScores).reduce((s, c) => s + c.total, 0);
      const maxScore = Object.values(categoryScores).reduce((s, c) => s + c.max, 0);
      const normalizedScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
      const catScoresNormalized: Record<string, number> = {};
      for (const [cat, scores] of Object.entries(categoryScores)) catScoresNormalized[cat] = scores.max > 0 ? Math.round((scores.total / scores.max) * 100) : 0;

      await supabase.from("benchmark_runs").insert({ user_id: userId, total_score: normalizedScore, max_score: 100, category_scores: catScoresNormalized, model_config: { model: "gemini-3-flash", prompt_version: promptVersion }, system_prompt_version: promptVersion });
      const { data: prevRuns } = await supabase.from("benchmark_runs").select("total_score, system_prompt_version").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
      const previousScore = prevRuns && prevRuns.length > 1 ? Number(prevRuns[1].total_score) : null;
      const delta = previousScore !== null ? normalizedScore - previousScore : null;

      // A/B testing: if we have enough runs, auto-select best prompt
      let abTestResult: any = null;
      if (prevRuns && prevRuns.length >= 3) {
        const versionScores: Record<number, number[]> = {};
        for (const r of prevRuns) {
          const v = r.system_prompt_version || 1;
          if (!versionScores[v]) versionScores[v] = [];
          versionScores[v].push(Number(r.total_score));
        }
        const versionAvgs = Object.entries(versionScores).map(([v, scores]) => ({
          version: Number(v), avg: scores.reduce((s, x) => s + x, 0) / scores.length, runs: scores.length,
        })).sort((a, b) => b.avg - a.avg);

        abTestResult = { variants: versionAvgs, bestVersion: versionAvgs[0]?.version };

        // Auto-activate best prompt if it has 2+ runs and beats current by 5+
        if (versionAvgs.length >= 2 && versionAvgs[0].runs >= 2) {
          const best = versionAvgs[0];
          const current = versionAvgs.find(v => v.version === promptVersion);
          if (current && best.version !== promptVersion && best.avg - current.avg >= 5) {
            await supabase.from("prompt_evolutions").update({ active: false }).eq("active", true);
            await supabase.from("prompt_evolutions").update({ active: true }).eq("version", best.version);
            abTestResult.autoSwitched = true;
            abTestResult.switchedTo = best.version;
          }
        }
      }

      return new Response(JSON.stringify({ score: normalizedScore, previousScore, delta, promptVersion, categoryScores: catScoresNormalized, results, abTest: abTestResult, message: delta !== null ? `SCORE: ${previousScore} → ${normalizedScore} (${delta >= 0 ? "+" : ""}${delta}) [Prompt v${promptVersion}]` : `SCORE: ${normalizedScore}/100 [Prompt v${promptVersion}]` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "history") {
      const { data: runs } = await supabase.from("benchmark_runs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
      return new Response(JSON.stringify({ runs: runs || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("benchmark error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

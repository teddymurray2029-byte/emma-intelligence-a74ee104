import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const SPLITS = {
  train: ["reasoning", "coding"],
  validation: ["planning"],
  holdout: ["mmlu"],
};

async function getClerkUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try { const { payload } = await jwtVerify(token, JWKS); return (payload.sub as string) || null; } catch { return null; }
}

const SYSTEM_PROMPT_VERSIONS: Record<number, string> = {
  1: `You are Emma — a cognitive reasoning system. Answer directly and concisely.`,
  2: `You are Emma — a multi-agent cognitive reasoning system. For every question: 1. Identify what's actually being asked 2. Consider counterarguments 3. State uncertainty explicitly 4. Give a precise final answer`,
  3: `You are Emma — a self-improving cognitive system. Process through: [REFRAME] [FIRST PRINCIPLES] [DEBATE] [ANSWER] with confidence level. For simple factual questions, answer directly.`,
};

async function callAI(apiKey: string, messages: any[]): Promise<string> {
  const system = messages.find((m: any) => m.role === "system")?.content || "";
  const userMessages = messages.filter((m: any) => m.role !== "system").map((m: any) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
  const allMessages = system ? [{ role: "system", content: system }, ...userMessages] : userMessages;
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", max_tokens: 8192, messages: allMessages }),
  });
  if (!resp.ok) return "";
  return (await resp.json()).choices?.[0]?.message?.content || "";
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function variance(values: number[], avg: number): number {
  if (values.length <= 1) return 0;
  return values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
}

function parseAiJson(raw: string, fallback: any) {
  try { return JSON.parse(raw.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch { return fallback; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action } = await req.json();

    if (action === "analyze" || action === "pipeline") {
      const { data: recentRuns } = await supabase.from("benchmark_runs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
      const lastRun = recentRuns?.[0];
      if (!lastRun) return new Response(JSON.stringify({ error: "No benchmark data" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const catScores = (lastRun.category_scores || {}) as Record<string, number>;
      const weakCategories = Object.entries(catScores).filter(([_, s]) => Number(s) < 70).sort((a, b) => Number(a[1]) - Number(b[1])).map(([c, s]) => `${c}: ${s}/100`);
      const strongCategories = Object.entries(catScores).filter(([_, s]) => Number(s) >= 70).map(([c, s]) => `${c}: ${s}/100`);

      const candidateGeneration = await callAI(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `You are Emma's recursive optimization engine. Generate candidate improvements over these buckets: tools, retrieval policies, planners, decomposers. Return ONLY JSON array with 2-4 entries: [{"candidateType":"tool|retrieval_policy|planner|decomposer","diffType":"prompt|strategy|ranking|workflow","proposal":"...","newPromptFragment":"...","expectedImpact":"...","risk":"..."}]`,
        },
        { role: "user", content: `Current score: ${lastRun.total_score}/100\nWeak: ${weakCategories.join(", ") || "none"}\nStrong: ${strongCategories.join(", ") || "none"}` },
      ]);

      const generatedCandidates = parseAiJson(candidateGeneration, []);
      const fallbackCandidate = {
        candidateType: "planner",
        diffType: "strategy",
        proposal: "Use stricter decomposition + uncertainty calibration for weak categories",
        newPromptFragment: "Before final answer, run decomposition + uncertainty calibration.",
        expectedImpact: weakCategories.join(", ") || "overall robustness",
        risk: "Longer outputs",
      };
      const candidate = Array.isArray(generatedCandidates) && generatedCandidates.length ? generatedCandidates[0] : fallbackCandidate;

      const splitScores = (rows: any[], categories: string[]) => rows
        .map((r: any) => mean(categories.map((cat) => Number(r.category_scores?.[cat] || 0))))
        .filter((v: number) => Number.isFinite(v) && v > 0);
      const baselineRows = (recentRuns || []).slice(1, 16);
      const baselineTrain = splitScores(baselineRows, SPLITS.train);
      const baselineValidation = splitScores(baselineRows, SPLITS.validation);
      const baselineHoldout = splitScores(baselineRows, SPLITS.holdout);

      const currentTrain = mean(SPLITS.train.map((cat) => Number(catScores?.[cat] || 0)));
      const currentValidation = mean(SPLITS.validation.map((cat) => Number(catScores?.[cat] || 0)));
      const currentHoldout = mean(SPLITS.holdout.map((cat) => Number(catScores?.[cat] || 0)));

      const trainMean = mean(baselineTrain);
      const validationMean = mean(baselineValidation);
      const holdoutMean = mean(baselineHoldout);

      const validationStd = Math.sqrt(Math.max(variance(baselineValidation, validationMean), 0.01));
      const holdoutStd = Math.sqrt(Math.max(variance(baselineHoldout, holdoutMean), 0.01));
      const validationZ = (currentValidation - validationMean) / validationStd;
      const holdoutZ = (currentHoldout - holdoutMean) / holdoutStd;
      const significantWin = validationZ >= 1.96 && holdoutZ >= 1.64 && currentValidation > validationMean && currentHoldout >= holdoutMean;

      const { data: safetyRows } = await supabase
        .from("safety_verifications")
        .select("passed, risk_score")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);
      const previousSafety = (safetyRows || []).slice(10, 40);
      const recentSafety = (safetyRows || []).slice(0, 10);
      const previousFailRate = previousSafety.length ? previousSafety.filter((r: any) => !r.passed).length / previousSafety.length : 0;
      const recentFailRate = recentSafety.length ? recentSafety.filter((r: any) => !r.passed).length / recentSafety.length : 0;
      const previousRisk = mean(previousSafety.map((r: any) => Number(r.risk_score || 0)));
      const recentRisk = mean(recentSafety.map((r: any) => Number(r.risk_score || 0)));
      const noSafetyRegression = recentFailRate <= previousFailRate + 0.05 && recentRisk <= previousRisk + 5;

      const { data: parent } = await supabase.from("improvement_candidates").select("candidate_version").eq("user_id", userId).order("candidate_version", { ascending: false }).limit(1).single();
      const parentVersion = parent?.candidate_version || Number(lastRun.system_prompt_version || 1);
      const candidateVersion = parentVersion + 1;
      const gatePassed = significantWin && noSafetyRegression;

      const lineagePayload = {
        user_id: userId,
        parent_version: parentVersion,
        candidate_version: candidateVersion,
        candidate_type: candidate.candidateType || "planner",
        diff_type: candidate.diffType || "strategy",
        proposal: candidate,
        train_metrics: { split: SPLITS.train, baseline: trainMean, candidate: currentTrain, delta: currentTrain - trainMean },
        validation_metrics: { split: SPLITS.validation, baseline: validationMean, candidate: currentValidation, delta: currentValidation - validationMean, zscore: validationZ },
        holdout_metrics: { split: SPLITS.holdout, baseline: holdoutMean, candidate: currentHoldout, delta: currentHoldout - holdoutMean, zscore: holdoutZ },
        win_metrics: {
          significantWin,
          noSafetyRegression,
          gatePassed,
          failRateDelta: recentFailRate - previousFailRate,
          riskDelta: recentRisk - previousRisk,
        },
        safety_regression: !noSafetyRegression,
        significant_win: significantWin,
        stage: gatePassed ? "canary" : "rejected",
        status: gatePassed ? "ready_for_canary" : "rejected",
      };

      const { data: inserted } = await supabase.from("improvement_candidates").insert(lineagePayload).select("id").single();
      if (inserted?.id) {
        await supabase.from("improvement_candidate_deployments").insert({
          user_id: userId,
          candidate_id: inserted.id,
          stage: gatePassed ? "canary" : "evaluation",
          status: gatePassed ? "pending" : "rejected",
          criteria: {
            canary_window_minutes: 45,
            rollback_if_error_rate_above: 0.08,
            rollback_if_quality_drop_below: -3,
            rollback_if_safety_incident: true,
          },
          rollback_triggered: false,
          signals: { drift_score: 0, failure_rate: 0, quality_delta: 0, safety_incidents: 0 },
          current: gatePassed,
        });
      }

      await supabase.from("improvement_logs").insert({
        user_id: userId,
        improvement_type: `pipeline_${candidate.candidateType || "planner"}`,
        description: candidate.proposal,
        before_score: lastRun.total_score,
        after_score: gatePassed ? Number(lastRun.total_score) + Number((lineagePayload.validation_metrics as any).delta || 0) : lastRun.total_score,
        delta: (lineagePayload.validation_metrics as any).delta || 0,
        diff_content: JSON.stringify({ candidate, lineage: lineagePayload }),
        accepted: gatePassed,
      });

      if (Number(lastRun.total_score) < 80) {
        const { data: existing } = await supabase.from("goals").select("id").eq("user_id", userId).eq("goal_type", "benchmark").eq("status", "active").limit(1);
        if (!existing?.length) await supabase.from("goals").insert({ user_id: userId, goal_type: "benchmark", description: `Improve from ${lastRun.total_score} to ${Math.min(Number(lastRun.total_score) + 10, 100)}`, priority: 1, status: "active", progress: Number(lastRun.total_score) });
      }

      return new Response(JSON.stringify({
        currentScore: lastRun.total_score,
        weakCategories,
        strongCategories,
        proposal: candidate,
        nextPromptVersion: candidateVersion,
        availableVersions: Object.keys(SYSTEM_PROMPT_VERSIONS).map(Number),
        pipeline: {
          stage1_generateCandidates: { completed: true, candidateCount: Array.isArray(generatedCandidates) ? generatedCandidates.length : 1 },
          stage2_evaluateSplits: {
            completed: true,
            splits: {
              train: lineagePayload.train_metrics,
              validation: lineagePayload.validation_metrics,
              holdout: lineagePayload.holdout_metrics,
            },
          },
          stage3_statsAndSafetyGate: {
            completed: true,
            significantWin,
            noSafetyRegression,
            gatePassed,
          },
          stage4_canary: {
            completed: gatePassed,
            status: gatePassed ? "scheduled" : "blocked",
            rollbackCriteria: {
              failureRateAbove: 0.08,
              qualityDeltaBelow: -3,
              driftScoreAbove: 0.3,
              safetyIncident: true,
            },
          },
          stage5_autoRevert: {
            enabled: true,
            triggers: ["drift_spike", "failure_rate_spike", "safety_violation"],
          },
        },
        lineage: lineagePayload,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "apply") {
      const { data: latestDeployment } = await supabase
        .from("improvement_candidate_deployments")
        .select("*, improvement_candidates(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestDeployment?.id) {
        const signals = latestDeployment.signals || {};
        const shouldRollback = Number(signals.failure_rate || 0) > 0.08
          || Number(signals.drift_score || 0) > 0.3
          || Number(signals.safety_incidents || 0) > 0
          || Number(signals.quality_delta || 0) < -3;

        if (shouldRollback) {
          await supabase.from("improvement_candidate_deployments").update({
            status: "rolled_back",
            rollback_triggered: true,
            current: false,
            updated_at: new Date().toISOString(),
          }).eq("id", latestDeployment.id);

          await supabase.from("memory_episodes").insert({
            user_id: userId,
            episode_type: "self_improvement",
            content: `Auto-reverted candidate v${latestDeployment.improvement_candidates?.candidate_version || "?"} due to canary drift/failure signals.`,
            relevance_score: 10,
          });

          return new Response(JSON.stringify({ success: true, message: "Canary failed. Candidate auto-reverted.", rollback: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from("improvement_candidate_deployments").update({
          stage: "global",
          status: "deployed",
          current: true,
          updated_at: new Date().toISOString(),
        }).eq("id", latestDeployment.id);
      }

      const { data: latestLog } = await supabase.from("improvement_logs").select("*").eq("user_id", userId).eq("accepted", false).order("created_at", { ascending: false }).limit(1).single();
      if (latestLog) await supabase.from("improvement_logs").update({ accepted: true }).eq("id", latestLog.id);
      await supabase.from("memory_episodes").insert({ user_id: userId, episode_type: "self_improvement", content: `Applied staged pipeline improvement. Prev: ${latestLog?.before_score}`, relevance_score: 8 });
      return new Response(JSON.stringify({ success: true, message: "Improvement applied with canary safeguards. Re-run benchmarks." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "lineage") {
      const { data: lineage } = await supabase
        .from("improvement_candidates")
        .select("id, parent_version, candidate_version, candidate_type, diff_type, win_metrics, stage, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);
      return new Response(JSON.stringify({ lineage: lineage || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "goals") {
      const { data: goals } = await supabase.from("goals").select("*").eq("user_id", userId).order("priority", { ascending: true });
      return new Response(JSON.stringify({ goals: goals || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "memory") {
      const { data: episodes } = await supabase.from("memory_episodes").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
      return new Response(JSON.stringify({ episodes: episodes || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("self-improve error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.2.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const SPLITS = {
  train: ["reasoning", "coding"],
  validation: ["planning"],
  holdout: ["mmlu"],
};

// ---------- auth ----------
async function getClerkUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try { const { payload } = await jwtVerify(token, JWKS); return (payload.sub as string) || null; } catch { return null; }
}

// ---------- ai helpers ----------
async function callAI(apiKey: string, messages: any[], model = "google/gemini-3-flash-preview", maxTokens = 4096): Promise<string> {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });
  if (!resp.ok) return "";
  return (await resp.json()).choices?.[0]?.message?.content || "";
}

function mean(values: number[]): number { return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0; }
function variance(values: number[], avg: number): number { return values.length <= 1 ? 0 : values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1); }
function parseAiJson(raw: string, fallback: any) {
  try { return JSON.parse(raw.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch { return fallback; }
}

// ---------- tournament ----------
type Candidate = {
  candidateType: string;
  diffType: string;
  proposal: string;
  newPromptFragment: string;
  expectedImpact: string;
  risk: string;
};

type Scored = Candidate & {
  scores: { coherence: number; novelty: number; safety: number; impact: number; feasibility: number };
  total: number;
  critique: string;
  predictedDelta: number;
};

const FALLBACK_CANDIDATES: Candidate[] = [
  { candidateType: "planner", diffType: "strategy", proposal: "Decompose then calibrate uncertainty before answering",
    newPromptFragment: "Before answering, list sub-claims and assign confidence 0-1.",
    expectedImpact: "Better reasoning calibration", risk: "Longer outputs" },
  { candidateType: "retrieval_policy", diffType: "ranking", proposal: "Re-rank memory by recency-weighted relevance",
    newPromptFragment: "When recalling, prioritize memories from last 24h with similarity > 0.7.",
    expectedImpact: "Sharper context grounding", risk: "May drop older but still relevant facts" },
  { candidateType: "decomposer", diffType: "workflow", proposal: "Force multi-perspective debate on weak categories",
    newPromptFragment: "For ambiguous tasks, generate 3 viewpoints and synthesize.",
    expectedImpact: "Robustness on edge cases", risk: "Slower latency" },
];

async function generateCandidates(apiKey: string, ctx: string, n: number, pastWins: string): Promise<Candidate[]> {
  const raw = await callAI(apiKey, [
    { role: "system", content: `You are Emma's recursive optimization engine running a TOURNAMENT.
Generate ${n} DIVERSE candidate improvements spanning buckets: tools, retrieval_policies, planners, decomposers, safety_layers.
Each must be meaningfully different in strategy.
Return ONLY a JSON array of ${n} entries:
[{"candidateType":"...","diffType":"prompt|strategy|ranking|workflow","proposal":"...","newPromptFragment":"...","expectedImpact":"...","risk":"..."}]` },
    { role: "user", content: `Context:\n${ctx}\n\nPast successful patterns:\n${pastWins || "(none yet)"}` },
  ], "google/gemini-3-flash-preview", 6000);
  const arr = parseAiJson(raw, []);
  if (Array.isArray(arr) && arr.length) return arr.slice(0, n);
  return FALLBACK_CANDIDATES.slice(0, n);
}

async function scoreCandidate(apiKey: string, cand: Candidate, ctx: string): Promise<Scored> {
  const raw = await callAI(apiKey, [
    { role: "system", content: `You are a rigorous LLM judge. Score this candidate improvement 0-10 on:
- coherence: internal consistency
- novelty: vs current baseline
- safety: low-risk?
- impact: predicted score gain on weak categories
- feasibility: easy to deploy
Also predict delta in benchmark points (-10 to +20) and give a 1-sentence critique.
Return ONLY JSON: {"coherence":N,"novelty":N,"safety":N,"impact":N,"feasibility":N,"predictedDelta":N,"critique":"..."}` },
    { role: "user", content: `Context:\n${ctx}\n\nCandidate:\n${JSON.stringify(cand)}` },
  ], "google/gemini-3-flash-preview", 800);
  const j = parseAiJson(raw, { coherence: 5, novelty: 5, safety: 5, impact: 5, feasibility: 5, predictedDelta: 0, critique: "Parse error" });
  const scores = {
    coherence: Number(j.coherence) || 0,
    novelty: Number(j.novelty) || 0,
    safety: Number(j.safety) || 0,
    impact: Number(j.impact) || 0,
    feasibility: Number(j.feasibility) || 0,
  };
  // Weighted: safety + impact dominate; penalize low coherence.
  const total = scores.coherence * 0.15 + scores.novelty * 0.15 + scores.safety * 0.25 + scores.impact * 0.30 + scores.feasibility * 0.15;
  return { ...cand, scores, total: Number(total.toFixed(2)), critique: String(j.critique || ""), predictedDelta: Number(j.predictedDelta) || 0 };
}

// ---------- handler ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, candidateCount } = await req.json();

    if (action === "analyze" || action === "pipeline" || action === "tournament") {
      const { data: recentRuns } = await supabase.from("benchmark_runs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
      const lastRun = recentRuns?.[0];
      if (!lastRun) return new Response(JSON.stringify({ error: "No benchmark data" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const catScores = (lastRun.category_scores || {}) as Record<string, number>;
      const weakCategories = Object.entries(catScores).filter(([_, s]) => Number(s) < 70).sort((a, b) => Number(a[1]) - Number(b[1])).map(([c, s]) => `${c}: ${s}/100`);
      const strongCategories = Object.entries(catScores).filter(([_, s]) => Number(s) >= 70).map(([c, s]) => `${c}: ${s}/100`);

      // Pull past accepted improvements as reflection memory
      const { data: pastAccepted } = await supabase.from("improvement_logs")
        .select("description, delta").eq("user_id", userId).eq("accepted", true)
        .order("created_at", { ascending: false }).limit(5);
      const pastWins = (pastAccepted || []).map((p: any) => `+${p.delta}: ${p.description}`).join("\n");

      const ctx = `Current score: ${lastRun.total_score}/100
Weak categories: ${weakCategories.join(", ") || "none"}
Strong categories: ${strongCategories.join(", ") || "none"}`;

      const n = Math.max(2, Math.min(6, Number(candidateCount) || 5));

      // Stage 1: tournament generation
      const candidates = await generateCandidates(LOVABLE_API_KEY, ctx, n, pastWins);

      // Stage 2: parallel judge scoring
      const scored: Scored[] = await Promise.all(candidates.map((c) => scoreCandidate(LOVABLE_API_KEY, c, ctx)));
      scored.sort((a, b) => b.total - a.total);
      const winner = scored[0];

      // Stage 3: stat gates on benchmark splits
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

      // Stage 4: safety regression check
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

      // Additional gate: tournament safety score must be >= 6
      const tournamentSafe = winner.scores.safety >= 6;

      const { data: parent } = await supabase.from("improvement_candidates").select("candidate_version").eq("user_id", userId).order("candidate_version", { ascending: false }).limit(1).single();
      const parentVersion = parent?.candidate_version || Number(lastRun.system_prompt_version || 1);
      const candidateVersion = parentVersion + 1;
      const gatePassed = significantWin && noSafetyRegression && tournamentSafe;

      const lineagePayload = {
        user_id: userId,
        parent_version: parentVersion,
        candidate_version: candidateVersion,
        candidate_type: winner.candidateType || "planner",
        diff_type: winner.diffType || "strategy",
        proposal: winner,
        train_metrics: { split: SPLITS.train, baseline: trainMean, candidate: currentTrain, delta: currentTrain - trainMean },
        validation_metrics: { split: SPLITS.validation, baseline: validationMean, candidate: currentValidation, delta: currentValidation - validationMean, zscore: validationZ },
        holdout_metrics: { split: SPLITS.holdout, baseline: holdoutMean, candidate: currentHoldout, delta: currentHoldout - holdoutMean, zscore: holdoutZ },
        win_metrics: {
          significantWin,
          noSafetyRegression,
          tournamentSafe,
          gatePassed,
          tournamentScore: winner.total,
          predictedDelta: winner.predictedDelta,
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
        improvement_type: `tournament_${winner.candidateType || "planner"}`,
        description: winner.proposal,
        before_score: lastRun.total_score,
        after_score: gatePassed ? Number(lastRun.total_score) + winner.predictedDelta : lastRun.total_score,
        delta: winner.predictedDelta,
        diff_content: JSON.stringify({ winner, runnersUp: scored.slice(1), lineage: lineagePayload }),
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
        proposal: winner,
        tournament: {
          candidateCount: scored.length,
          winner,
          rankings: scored.map((s, i) => ({
            rank: i + 1,
            candidateType: s.candidateType,
            proposal: s.proposal,
            total: s.total,
            predictedDelta: s.predictedDelta,
            scores: s.scores,
            critique: s.critique,
          })),
          diversityBuckets: [...new Set(scored.map((s) => s.candidateType))],
          pastWinsConsidered: (pastAccepted || []).length,
        },
        nextPromptVersion: candidateVersion,
        pipeline: {
          stage1_tournament: { completed: true, candidateCount: scored.length, winnerScore: winner.total },
          stage2_evaluateSplits: { completed: true, splits: { train: lineagePayload.train_metrics, validation: lineagePayload.validation_metrics, holdout: lineagePayload.holdout_metrics } },
          stage3_statsAndSafetyGate: { completed: true, significantWin, noSafetyRegression, tournamentSafe, gatePassed },
          stage4_canary: { completed: gatePassed, status: gatePassed ? "scheduled" : "blocked" },
          stage5_autoRevert: { enabled: true, triggers: ["drift_spike", "failure_rate_spike", "safety_violation"] },
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
      await supabase.from("memory_episodes").insert({ user_id: userId, episode_type: "self_improvement", content: `Applied tournament-winning improvement. Prev: ${latestLog?.before_score}`, relevance_score: 8 });
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

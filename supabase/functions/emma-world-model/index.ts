import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_STATE = { entities: [], relations: [], beliefs: [], temporal: [] };

async function callAI(apiKey: string, messages: any[], model = "google/gemini-2.5-flash-lite"): Promise<string> {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 8192, messages }),
  });
  if (!resp.ok) return "";
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

// Belief decay: reduce confidence of stale beliefs
function applyBeliefDecay(state: any): { state: any; decayEvents: any[] } {
  const decayEvents: any[] = [];
  if (!state.beliefs || !Array.isArray(state.beliefs)) return { state, decayEvents };

  const now = Date.now();
  state.beliefs = state.beliefs.map((b: any) => {
    const lastUpdated = b.last_updated ? new Date(b.last_updated).getTime() : (now - 48 * 3600 * 1000);
    const ageHours = (now - lastUpdated) / (3600 * 1000);

    let decayRate = 0;
    if (ageHours > 72) decayRate = 0.15;
    else if (ageHours > 24) decayRate = 0.05;

    if (decayRate > 0 && b.confidence !== undefined) {
      const oldConf = b.confidence;
      b.confidence = Math.max(0.05, b.confidence * (1 - decayRate));
      decayEvents.push({ statement: (b.statement || "").slice(0, 80), oldConfidence: oldConf, newConfidence: b.confidence, ageHours: Math.round(ageHours), decayRate });
    }
    return b;
  });

  // Remove beliefs with very low confidence
  const removed = state.beliefs.filter((b: any) => b.confidence !== undefined && b.confidence < 0.1);
  if (removed.length) {
    decayEvents.push(...removed.map((b: any) => ({ type: "removed", statement: (b.statement || "").slice(0, 80), confidence: b.confidence })));
    state.beliefs = state.beliefs.filter((b: any) => b.confidence === undefined || b.confidence >= 0.1);
  }

  return { state, decayEvents };
}

function ensureTemporalEvidence(state: any) {
  const nowIso = new Date().toISOString();
  const next = state || {};
  next.entities = Array.isArray(next.entities) ? next.entities : [];
  next.relations = Array.isArray(next.relations) ? next.relations : [];
  next.beliefs = Array.isArray(next.beliefs) ? next.beliefs : [];
  next.temporal = Array.isArray(next.temporal) ? next.temporal : [];

  next.entities = next.entities.map((entity: any) => ({
    ...entity,
    confidence: Math.max(0, Math.min(1, Number(entity.confidence ?? 0.5))),
    uncertainty: Math.max(0, Math.min(1, Number(entity.uncertainty ?? (1 - Number(entity.confidence ?? 0.5))))),
    evidence: Array.isArray(entity.evidence) ? entity.evidence.map((ev: any) => ({ observed_at: ev?.observed_at || nowIso, ...ev })) : [],
    last_updated: entity.last_updated || nowIso,
  }));

  next.relations = next.relations.map((relation: any) => ({
    ...relation,
    strength: Math.max(0, Math.min(1, Number(relation.strength ?? 0.5))),
    confidence: Math.max(0, Math.min(1, Number(relation.confidence ?? relation.strength ?? 0.5))),
    uncertainty: Math.max(0, Math.min(1, Number(relation.uncertainty ?? (1 - Number(relation.confidence ?? relation.strength ?? 0.5))))),
    evidence: Array.isArray(relation.evidence) ? relation.evidence.map((ev: any) => ({ observed_at: ev?.observed_at || nowIso, ...ev })) : [],
    last_updated: relation.last_updated || nowIso,
  }));

  next.beliefs = next.beliefs.map((belief: any) => ({
    ...belief,
    confidence: Math.max(0.01, Math.min(1, Number(belief.confidence ?? 0.5))),
    uncertainty: Math.max(0, Math.min(1, Number(belief.uncertainty ?? (1 - Number(belief.confidence ?? 0.5))))),
    evidence: Array.isArray(belief.evidence) ? belief.evidence.map((ev: any) => ({ observed_at: ev?.observed_at || nowIso, ...ev })) : [],
    last_updated: belief.last_updated || nowIso,
  }));

  return next;
}

function applyPredictionFeedbackToBeliefs(state: any, prediction: any, observedOutcome: any): { state: any; updatedBeliefs: number; retractedBeliefs: number } {
  const next = ensureTemporalEvidence(JSON.parse(JSON.stringify(state || DEFAULT_STATE)));
  const predictedProbability = Math.max(0, Math.min(1, Number(prediction?.predicted_probability ?? prediction?.confidence ?? 0.5)));
  const actualProbability = Math.max(0, Math.min(1, Number(observedOutcome?.actual_probability ?? observedOutcome?.actual_confidence ?? 0.5)));
  const error = Math.abs(predictedProbability - actualProbability);
  const shouldRetract = error >= 0.7;

  let updatedBeliefs = 0;
  let retractedBeliefs = 0;

  next.beliefs = next.beliefs
    .map((belief: any) => {
      const statement = String(belief.statement || "").toLowerCase();
      const linkedToPrediction = statement.includes(String(prediction?.hypothesis || "").toLowerCase().slice(0, 50))
        || statement.includes(String(prediction?.event_key || "").toLowerCase().slice(0, 50));
      if (!linkedToPrediction) return belief;

      updatedBeliefs += 1;
      const oldConfidence = Math.max(0.01, Math.min(1, Number(belief.confidence ?? 0.5)));
      const decayMultiplier = 1 - Math.min(0.9, error * 0.8);
      const decayedConfidence = Math.max(0.01, oldConfidence * decayMultiplier);
      const updated = {
        ...belief,
        confidence: decayedConfidence,
        uncertainty: Math.max(0, 1 - decayedConfidence),
        last_updated: new Date().toISOString(),
        evidence: [
          ...(Array.isArray(belief.evidence) ? belief.evidence : []),
          {
            type: "prediction_feedback",
            observed_at: new Date().toISOString(),
            predicted_probability: predictedProbability,
            actual_probability: actualProbability,
            calibration_error: error,
          },
        ].slice(-20),
      };
      if (shouldRetract && decayedConfidence < 0.2) {
        retractedBeliefs += 1;
        return { ...updated, retracted: true, retracted_at: new Date().toISOString() };
      }
      return updated;
    })
    .filter((belief: any) => !belief.retracted);

  return { state: next, updatedBeliefs, retractedBeliefs };
}

// Contradiction resolution: find opposing beliefs and remove lowest-confidence
function resolveContradictions(apiKey: string, state: any): { state: any; resolutions: any[] } {
  const resolutions: any[] = [];
  if (!state.beliefs || state.beliefs.length < 2) return { state, resolutions };

  // Simple heuristic: find beliefs with negation patterns
  const negationPairs: [number, number][] = [];
  for (let i = 0; i < state.beliefs.length; i++) {
    for (let j = i + 1; j < state.beliefs.length; j++) {
      const a = (state.beliefs[i].statement || "").toLowerCase();
      const b = (state.beliefs[j].statement || "").toLowerCase();
      // Check for direct contradictions
      if (
        (a.includes("not") && b.replace(/not /g, "") === a.replace(/not /g, "")) ||
        (b.includes("not") && a.replace(/not /g, "") === b.replace(/not /g, "")) ||
        (a.includes("fast") && b.includes("slow") && a.replace("fast", "") === b.replace("slow", "")) ||
        (a.includes("good") && b.includes("bad") && a.replace("good", "") === b.replace("bad", "")) ||
        (a.includes("true") && b.includes("false") && a.replace("true", "") === b.replace("false", ""))
      ) {
        negationPairs.push([i, j]);
      }
    }
  }

  // Remove the lower-confidence belief from each contradicting pair
  const toRemove = new Set<number>();
  for (const [i, j] of negationPairs) {
    const confI = state.beliefs[i].confidence ?? 0.5;
    const confJ = state.beliefs[j].confidence ?? 0.5;
    const removeIdx = confI < confJ ? i : j;
    const keepIdx = confI < confJ ? j : i;
    toRemove.add(removeIdx);
    resolutions.push({
      kept: (state.beliefs[keepIdx].statement || "").slice(0, 80),
      removed: (state.beliefs[removeIdx].statement || "").slice(0, 80),
      keptConfidence: state.beliefs[keepIdx].confidence,
      removedConfidence: state.beliefs[removeIdx].confidence,
    });
  }

  if (toRemove.size > 0) {
    state.beliefs = state.beliefs.filter((_: any, i: number) => !toRemove.has(i));
  }

  return { state, resolutions };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const payload = await req.json();
    const { action, observations, query, hypothesis, horizon, intervention, prediction_id, observed_outcome, success } = payload;

    if (action === "get_state") {
      const { data } = await supabase
        .from("world_model_states")
        .select("*")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      return new Response(JSON.stringify({
        state: ensureTemporalEvidence(data?.state || DEFAULT_STATE),
        version: data?.version || 0,
        updatedAt: data?.created_at || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === MAINTAIN STATE: Belief decay + contradiction resolution ===
    if (action === "maintain_state") {
      const { data: current } = await supabase
        .from("world_model_states")
        .select("state, version")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (!current) {
        return new Response(JSON.stringify({ message: "No world model state to maintain", decayEvents: [], resolutions: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let state = ensureTemporalEvidence(JSON.parse(JSON.stringify(current.state)));

      // Apply belief decay
      const { state: decayedState, decayEvents } = applyBeliefDecay(state);
      state = decayedState;

      // Resolve contradictions
      const { state: resolvedState, resolutions } = resolveContradictions(LOVABLE_API_KEY, state);
      state = resolvedState;

      const hasChanges = decayEvents.length > 0 || resolutions.length > 0;

      if (hasChanges) {
        await supabase.from("world_model_states").insert({
          user_id: userId,
          version: current.version + 1,
          state,
          diff: { decay: decayEvents, contradictions_resolved: resolutions, maintenance: true },
        });
      }

      return new Response(JSON.stringify({
        maintained: hasChanges,
        version: hasChanges ? current.version + 1 : current.version,
        decayEvents,
        resolutions,
        beliefsRemaining: state.beliefs?.length || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update_state") {
      if (!observations) throw new Error("observations required");

      // Auto-maintain before merging (belief decay + contradiction resolution)
      const { data: current } = await supabase
        .from("world_model_states")
        .select("state, version")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      let currentState = ensureTemporalEvidence(current?.state || DEFAULT_STATE);
      let currentVersion = current?.version || 0;

      // Apply maintenance first
      const { state: maintained, decayEvents } = applyBeliefDecay(JSON.parse(JSON.stringify(currentState)));
      const { state: resolved, resolutions } = resolveContradictions(LOVABLE_API_KEY, maintained);
      currentState = resolved;

      // Use AI to merge observations into the world model
      const mergeResult = await callAI(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `You maintain a persistent world model as structured JSON. Given the current state and new observations, produce an updated state and a diff of changes.

Current state structure:
- entities: [{name, type, properties, confidence, uncertainty, evidence:[{source, detail, observed_at}], last_updated}] - known objects/concepts
- relations: [{from, to, type, strength, confidence, uncertainty, evidence:[{source, detail, observed_at}], last_updated}] - how entities connect
- beliefs: [{statement, confidence, uncertainty, evidence:[{source, detail, observed_at}], last_updated}] - inferred facts (ALWAYS include last_updated as ISO string)
- temporal: [{event, timestamp, entities_involved}] - time-ordered events

Return ONLY valid JSON:
{
  "updated_state": { entities: [...], relations: [...], beliefs: [...], temporal: [...] },
  "diff": { "added": [...], "modified": [...], "removed": [...] }
}`
        },
        {
          role: "user",
          content: `Current world model:\n${JSON.stringify(currentState, null, 2)}\n\nNew observations:\n${observations}`
        }
      ], "google/gemini-3-flash-preview");

      let updatedState = currentState;
      let diff: any = { added: [], modified: [], removed: [] };

      try {
        const parsed = JSON.parse(mergeResult.replace(/```json\n?/g, "").replace(/```/g, "").trim());
        if (parsed.updated_state) updatedState = parsed.updated_state;
        if (parsed.diff) diff = parsed.diff;
      } catch {}

      updatedState = ensureTemporalEvidence(updatedState);

      // Add maintenance info to diff
      if (decayEvents.length > 0) diff.decay = decayEvents;
      if (resolutions.length > 0) diff.contradictions_resolved = resolutions;

      // Store new version
      await supabase.from("world_model_states").insert({
        user_id: userId,
        version: currentVersion + 1,
        state: updatedState,
        diff,
      });

      return new Response(JSON.stringify({
        state: updatedState,
        version: currentVersion + 1,
        diff,
        maintenance: { decayEvents: decayEvents.length, contradictionsResolved: resolutions.length },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "query_state") {
      if (!query) throw new Error("query required");

      const { data: current } = await supabase
        .from("world_model_states")
        .select("state")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const state = ensureTemporalEvidence(current?.state || DEFAULT_STATE);

      const answer = await callAI(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `You are querying a persistent world model. Answer the user's question based on the world model state. If the information isn't in the model, say so. Be precise and reference specific entities/beliefs.`
        },
        {
          role: "user",
          content: `World model:\n${JSON.stringify(state, null, 2)}\n\nQuery: ${query}`
        }
      ], "google/gemini-3-flash-preview");

      return new Response(JSON.stringify({ answer, state }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "forecast" || action === "counterfactual") {
      if (!hypothesis) throw new Error("hypothesis required");

      const { data: current } = await supabase
        .from("world_model_states")
        .select("state, version")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();
      const state = ensureTemporalEvidence(current?.state || DEFAULT_STATE);

      const promptType = action === "counterfactual" ? "counterfactual scenario under intervention" : "forecast";
      const modelResult = await callAI(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `Produce probabilistic ${promptType} reasoning grounded in world state. Return ONLY JSON:
{"event_key":"...", "summary":"...", "predicted_probability":0.0-1.0, "confidence":0.0-1.0, "drivers":["..."], "assumptions":["..."], "expected_outcome_at":"ISO8601", "causal_intervention":{"applied":boolean,"description":"..."}}`
        },
        {
          role: "user",
          content: `World model:\n${JSON.stringify(state).slice(0, 5000)}\n\nHypothesis: ${hypothesis}\nHorizon: ${horizon || "unspecified"}\nIntervention: ${intervention || "none"}`
        },
      ], "google/gemini-3-flash-preview");

      let prediction: any = null;
      try {
        prediction = JSON.parse(modelResult.replace(/```json\n?/g, "").replace(/```/g, "").trim());
      } catch {
        prediction = {};
      }

      const predictedProbability = Math.max(0, Math.min(1, Number(prediction.predicted_probability ?? prediction.confidence ?? 0.5)));
      const confidence = Math.max(0, Math.min(1, Number(prediction.confidence ?? 0.5)));
      const eventKey = prediction.event_key || `${action}:${hypothesis.toLowerCase().slice(0, 96)}`;

      const { data: insertedPrediction } = await supabase.from("world_model_predictions")
        .insert({
          user_id: userId,
          prediction_type: action,
          event_key: eventKey,
          hypothesis,
          intervention: intervention || null,
          horizon: horizon || null,
          predicted_probability: predictedProbability,
          confidence,
          assumptions: prediction.assumptions || [],
          drivers: prediction.drivers || [],
          model_snapshot_version: current?.version || 0,
          model_snapshot: state,
          metadata: { summary: prediction.summary || null, expected_outcome_at: prediction.expected_outcome_at || null, causal_intervention: prediction.causal_intervention || null },
        })
        .select("*")
        .single();

      return new Response(JSON.stringify({
        prediction: insertedPrediction,
        summary: prediction.summary || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "score_prediction") {
      if (!prediction_id) throw new Error("prediction_id required");
      if (observed_outcome === undefined) throw new Error("observed_outcome required");

      const { data: prediction } = await supabase.from("world_model_predictions")
        .select("*")
        .eq("id", prediction_id)
        .eq("user_id", userId)
        .single();
      if (!prediction) throw new Error("prediction not found");

      const predictedProbability = Math.max(0, Math.min(1, Number(prediction.predicted_probability ?? prediction.confidence ?? 0.5)));
      const actualProbability = Math.max(0, Math.min(1, Number(observed_outcome?.actual_probability ?? observed_outcome?.actual_confidence ?? (success ? 1 : 0))));
      const brierScore = Math.pow(predictedProbability - actualProbability, 2);

      const { data: scoreRow } = await supabase.from("world_model_prediction_outcomes")
        .insert({
          user_id: userId,
          prediction_id,
          event_key: prediction.event_key,
          prediction_type: prediction.prediction_type,
          intervention: prediction.intervention,
          predicted_probability: predictedProbability,
          observed_outcome,
          actual_probability: actualProbability,
          success: success ?? (actualProbability >= 0.5),
          brier_score: brierScore,
          absolute_error: Math.abs(predictedProbability - actualProbability),
        })
        .select("*")
        .single();

      await supabase.from("world_model_predictions")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", prediction_id)
        .eq("user_id", userId);

      const { data: outcomes } = await supabase.from("world_model_prediction_outcomes")
        .select("brier_score, absolute_error")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);

      const calibrationError = outcomes?.length
        ? outcomes.reduce((sum: number, o: any) => sum + Number(o.absolute_error || 0), 0) / outcomes.length
        : Number(scoreRow.absolute_error || 0);

      await supabase.from("world_model_calibration_metrics").insert({
        user_id: userId,
        sample_size: outcomes?.length || 1,
        mean_brier_score: outcomes?.length
          ? outcomes.reduce((sum: number, o: any) => sum + Number(o.brier_score || 0), 0) / outcomes.length
          : Number(scoreRow.brier_score || 0),
        mean_absolute_calibration_error: calibrationError,
      });

      const { data: current } = await supabase
        .from("world_model_states")
        .select("state, version")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (current?.state) {
        const feedback = applyPredictionFeedbackToBeliefs(current.state, prediction, {
          actual_probability: actualProbability,
          success: scoreRow.success,
        });
        await supabase.from("world_model_states").insert({
          user_id: userId,
          version: (current.version || 0) + 1,
          state: feedback.state,
          diff: {
            prediction_feedback: {
              prediction_id,
              outcome_id: scoreRow.id,
              updatedBeliefs: feedback.updatedBeliefs,
              retractedBeliefs: feedback.retractedBeliefs,
              calibration_error: Math.abs(predictedProbability - actualProbability),
            },
          },
        });
      }

      return new Response(JSON.stringify({
        outcome: scoreRow,
        calibrationError,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "dashboard_metrics") {
      const { data: outcomes } = await supabase.from("world_model_prediction_outcomes")
        .select("absolute_error, brier_score, prediction_type, success, intervention")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);

      const total = outcomes?.length || 0;
      const meanAbsError = total ? outcomes!.reduce((sum: number, o: any) => sum + Number(o.absolute_error || 0), 0) / total : 0;
      const meanBrier = total ? outcomes!.reduce((sum: number, o: any) => sum + Number(o.brier_score || 0), 0) / total : 0;
      const interventionRows = (outcomes || []).filter((o: any) => o.prediction_type === "counterfactual" || o.intervention);
      const interventionSuccessRate = interventionRows.length
        ? interventionRows.filter((o: any) => !!o.success).length / interventionRows.length
        : 0;

      return new Response(JSON.stringify({
        calibration: {
          sampleSize: total,
          meanAbsoluteCalibrationError: meanAbsError,
          meanBrierScore: meanBrier,
        },
        causalIntervention: {
          sampleSize: interventionRows.length,
          successRate: interventionSuccessRate,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("world-model error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

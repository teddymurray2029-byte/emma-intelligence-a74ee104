import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

    const { action, observations, query } = await req.json();

    if (action === "get_state") {
      const { data } = await supabase
        .from("world_model_states")
        .select("*")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      return new Response(JSON.stringify({
        state: data?.state || { entities: [], relations: [], beliefs: [], temporal: [] },
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

      let state = JSON.parse(JSON.stringify(current.state));

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

      let currentState = current?.state || { entities: [], relations: [], beliefs: [], temporal: [] };
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
- entities: [{name, type, properties, confidence}] - known objects/concepts
- relations: [{from, to, type, strength}] - how entities connect
- beliefs: [{statement, confidence, evidence, last_updated}] - inferred facts (ALWAYS include last_updated as ISO string)
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

      const state = current?.state || { entities: [], relations: [], beliefs: [], temporal: [] };

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

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("world-model error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

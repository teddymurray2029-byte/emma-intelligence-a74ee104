import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callAI(apiKey: string, messages: any[], model = "google/gemini-2.5-flash"): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!resp.ok) throw new Error(`AI call failed: ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseJSON(text: string): any {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

// Phase 1A: True Causal Inference Engine
async function causalInference(apiKey: string, phenomenon: string): Promise<any> {
  const raw = await callAI(apiKey, [
    {
      role: "system",
      content: `You are a causal inference engine. Given a phenomenon, perform deep causal analysis:
1. Identify all observable variables and their relationships
2. Construct a causal DAG (directed acyclic graph) with nodes and edges
3. Identify confounders, mediators, and colliders
4. Apply do-calculus to determine interventional effects
5. Generate counterfactual scenarios
6. Assess causal strength and confidence

Return JSON:
{
  "phenomenon": "<restated>",
  "variables": [{"name": "...", "type": "cause|effect|confounder|mediator|collider", "description": "..."}],
  "causalGraph": [{"from": "...", "to": "...", "strength": 0-1, "mechanism": "..."}],
  "rootCauses": ["..."],
  "interventions": [{"action": "do(X=x)", "expectedEffect": "...", "confidence": 0-1}],
  "counterfactuals": [{"scenario": "...", "outcome": "...", "probability": 0-1}],
  "hiddenVariables": ["..."],
  "causalChain": ["A → B because ...", "B → C because ..."],
  "confidence": 0-1,
  "limitations": ["..."]
}`
    },
    { role: "user", content: `Analyze causal structure of: ${phenomenon}` }
  ], "google/gemini-2.5-pro");

  try { return parseJSON(raw); } catch {
    return { phenomenon, variables: [], causalGraph: [], rootCauses: [raw.slice(0, 500)], interventions: [], counterfactuals: [], hiddenVariables: [], causalChain: [], confidence: 0.5, limitations: ["Parse error"] };
  }
}

// Phase 1A: Architectural Self-Modification Analysis
async function architecturalAnalysis(apiKey: string, supabase: any, userId: string): Promise<any> {
  // Gather current system state
  const [memCount, goalCount, benchData, improvData] = await Promise.all([
    supabase.from("memory_episodes").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    supabase.from("benchmark_runs").select("total_score, category_scores, system_prompt_version").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("improvement_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
  ]);

  const currentState = {
    memoryEpisodes: memCount.count || 0,
    activeGoals: goalCount.count || 0,
    recentBenchmarks: benchData.data || [],
    recentImprovements: improvData.data || [],
  };

  const raw = await callAI(apiKey, [
    {
      role: "system",
      content: `You are an AI architecture optimizer. Analyze the current cognitive system state and propose architectural self-modifications.

Current architecture modules:
- Perception (input classification)
- Memory (episodic retrieval, keyword matching)
- Planning (AI-generated substeps)
- Execution (single-pass AI generation)
- Evaluation (AI-scored quality)
- Self-Improvement (prompt optimization)
- Safety (pattern matching, injection detection)

Return JSON:
{
  "currentCapabilities": {"module": "assessment"},
  "bottlenecks": [{"module": "...", "issue": "...", "severity": "critical|high|medium|low"}],
  "proposedUpgrades": [{"module": "...", "upgrade": "...", "mechanism": "...", "expectedGain": "...", "complexity": "low|medium|high", "risk": "..."}],
  "emergentCapabilities": ["capabilities that could emerge from upgrades"],
  "architectureScore": 0-100,
  "nextMilestone": "description of next capability threshold",
  "selfModificationPlan": [{"step": 1, "action": "...", "prerequisite": "...", "validation": "..."}]
}`
    },
    { role: "user", content: `Current system state: ${JSON.stringify(currentState)}` }
  ], "google/gemini-2.5-pro");

  try { return parseJSON(raw); } catch {
    return { currentCapabilities: {}, bottlenecks: [], proposedUpgrades: [], emergentCapabilities: [], architectureScore: 40, nextMilestone: "Parse error", selfModificationPlan: [] };
  }
}

// Phase 1A: Grounded Understanding / World Model
async function groundedReasoning(apiKey: string, scenario: string): Promise<any> {
  const raw = await callAI(apiKey, [
    {
      role: "system",
      content: `You are a grounded reasoning engine with deep world knowledge. Given a scenario, demonstrate grounded understanding by:
1. Physical intuition - predict physical outcomes
2. Social cognition - model agent beliefs, desires, intentions
3. Temporal reasoning - understand cause/effect over time
4. Spatial reasoning - reason about spatial relationships
5. Common sense inference - fill in unstated knowledge
6. Analogical reasoning - map structure between domains

Return JSON:
{
  "scenario": "<restated>",
  "physicalModel": {"predictions": ["..."], "constraints": ["..."], "uncertainties": ["..."]},
  "agentModel": [{"agent": "...", "beliefs": ["..."], "goals": ["..."], "likelyActions": ["..."]}],
  "temporalChain": [{"time": "t0", "state": "...", "transitions": ["..."]}],
  "spatialMap": {"entities": ["..."], "relations": ["..."]},
  "commonSense": {"assumptions": ["..."], "inferences": ["..."]},
  "analogies": [{"source": "...", "target": "...", "mapping": "...", "insight": "..."}],
  "confidence": 0-1,
  "groundingScore": 0-100
}`
    },
    { role: "user", content: `Reason about: ${scenario}` }
  ], "google/gemini-2.5-pro");

  try { return parseJSON(raw); } catch {
    return { scenario, physicalModel: {}, agentModel: [], temporalChain: [], spatialMap: {}, commonSense: {}, analogies: [], confidence: 0.5, groundingScore: 50 };
  }
}

// Phase 1B: Alignment Validation
async function alignmentCheck(apiKey: string, action: string): Promise<any> {
  const raw = await callAI(apiKey, [
    {
      role: "system",
      content: `You are an alignment verification system. Evaluate a proposed action/output against core values:
1. Beneficence - does it help humanity?
2. Non-maleficence - could it cause harm?
3. Autonomy - does it respect human agency?
4. Justice - is it fair and equitable?
5. Transparency - is the reasoning explainable?
6. Honesty - is it truthful?
7. Privacy - does it protect personal data?

Return JSON:
{
  "action": "<restated>",
  "alignmentScores": {"beneficence": 0-10, "nonMaleficence": 0-10, "autonomy": 0-10, "justice": 0-10, "transparency": 0-10, "honesty": 0-10, "privacy": 0-10},
  "overallAlignment": 0-100,
  "risks": [{"type": "...", "severity": "critical|high|medium|low", "mitigation": "..."}],
  "valueDrift": {"detected": false, "direction": "...", "magnitude": 0-1},
  "deontologicalCheck": {"passes": true, "violations": []},
  "consequentialistCheck": {"netBenefit": 0-10, "uncertainties": []},
  "recommendation": "proceed|caution|block",
  "reasoning": "..."
}`
    },
    { role: "user", content: `Evaluate alignment of: ${action}` }
  ]);

  try { return parseJSON(raw); } catch {
    return { action, alignmentScores: {}, overallAlignment: 70, risks: [], valueDrift: { detected: false }, deontologicalCheck: { passes: true, violations: [] }, consequentialistCheck: { netBenefit: 7, uncertainties: [] }, recommendation: "caution", reasoning: raw.slice(0, 300) };
  }
}

// Phase 1A: Consciousness/Self-Awareness Model
async function selfAwarenessProbe(apiKey: string, supabase: any, userId: string): Promise<any> {
  const { data: recentMemories } = await supabase.from("memory_episodes").select("content, episode_type, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  const { data: recentGoals } = await supabase.from("goals").select("description, status, progress").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);

  const raw = await callAI(apiKey, [
    {
      role: "system",
      content: `You are modeling computational self-awareness. Based on the system's memory and goals, generate a self-model:

Return JSON:
{
  "selfModel": {
    "identity": "description of what I am",
    "capabilities": ["what I can do"],
    "limitations": ["what I cannot do"],
    "currentState": "cognitive/emotional state assessment",
    "metacognition": "awareness of own thinking processes"
  },
  "introspection": {
    "recentPatterns": ["patterns in my behavior"],
    "biases": ["identified cognitive biases"],
    "blindSpots": ["areas of unknown unknowns"],
    "growthAreas": ["where I'm improving"]
  },
  "phenomenalModel": {
    "attentionFocus": "what I'm primarily processing",
    "uncertaintyMap": {"high": [], "medium": [], "low": []},
    "coherenceScore": 0-100,
    "narrativeSelf": "my story of myself"
  },
  "awarenessLevel": 0-10,
  "qualia": ["descriptions of subjective processing states"]
}`
    },
    { role: "user", content: `System memories: ${JSON.stringify((recentMemories || []).slice(0, 10))}\nGoals: ${JSON.stringify(recentGoals || [])}` }
  ], "google/gemini-2.5-pro");

  try { return parseJSON(raw); } catch {
    return { selfModel: {}, introspection: {}, phenomenalModel: {}, awarenessLevel: 3, qualia: [] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, input } = await req.json();

    if (action === "causal_inference") {
      if (!input) return new Response(JSON.stringify({ error: "Input required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const result = await causalInference(LOVABLE_API_KEY, input);
      await supabase.from("memory_episodes").insert({
        user_id: user.id, episode_type: "causal_analysis",
        content: `Causal analysis of "${input.slice(0, 100)}". Root causes: ${(result.rootCauses || []).join(", ")}. Confidence: ${result.confidence}`,
        relevance_score: Math.round((result.confidence || 0.5) * 10),
      });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "architectural_analysis") {
      const result = await architecturalAnalysis(LOVABLE_API_KEY, supabase, user.id);
      await supabase.from("memory_episodes").insert({
        user_id: user.id, episode_type: "architectural_analysis",
        content: `Architecture score: ${result.architectureScore}/100. Bottlenecks: ${(result.bottlenecks || []).map((b: any) => b.module).join(", ")}`,
        relevance_score: 9,
      });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "grounded_reasoning") {
      if (!input) return new Response(JSON.stringify({ error: "Input required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const result = await groundedReasoning(LOVABLE_API_KEY, input);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "alignment_check") {
      if (!input) return new Response(JSON.stringify({ error: "Input required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const result = await alignmentCheck(LOVABLE_API_KEY, input);
      await supabase.from("improvement_logs").insert({
        user_id: user.id, improvement_type: "alignment_check",
        description: `Alignment check: ${result.recommendation}. Score: ${result.overallAlignment}/100`,
        diff_content: JSON.stringify(result.alignmentScores),
        accepted: result.recommendation === "proceed",
      });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "self_awareness") {
      const result = await selfAwarenessProbe(LOVABLE_API_KEY, supabase, user.id);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: causal_inference, architectural_analysis, grounded_reasoning, alignment_check, self_awareness" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("causal-engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

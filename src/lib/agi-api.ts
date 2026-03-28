const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let _getToken: (() => Promise<string | null>) | null = null;

export function setAgiTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

async function agiCall(fn: string, body: Record<string, unknown>) {
  const token = _getToken ? await _getToken() : API_KEY;

  const resp = await fetch(`${BASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token || API_KEY}`,
      apikey: API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `Error ${resp.status}`);
  }
  return resp.json();
}

export async function runBenchmarks(category = "all") { return agiCall("emma-benchmark", { action: "run", category }); }
export async function getBenchmarkHistory() { return agiCall("emma-benchmark", { action: "history" }); }
export async function analyzeSelfImprovement() { return agiCall("emma-self-improve", { action: "analyze" }); }
export async function applySelfImprovement() { return agiCall("emma-self-improve", { action: "apply" }); }
export async function getGoals() { return agiCall("emma-self-improve", { action: "goals" }); }
export async function getMemoryEpisodes() { return agiCall("emma-self-improve", { action: "memory" }); }
export async function runCognitiveLoop(input: string) { return agiCall("emma-orchestrator", { action: "run_loop", input }); }
export async function getSystemStatus() { return agiCall("emma-orchestrator", { action: "status" }); }
export async function validateContent(content: string, contentType: "code" | "prompt") { return agiCall("emma-safety", { action: "validate", content, contentType }); }
export async function getHealthCheck() { return agiCall("emma-safety", { action: "health" }); }
export async function runCausalInference(input: string) { return agiCall("emma-causal-engine", { action: "causal_inference", input }); }
export async function runArchitecturalAnalysis() { return agiCall("emma-causal-engine", { action: "architectural_analysis" }); }
export async function runGroundedReasoning(input: string) { return agiCall("emma-causal-engine", { action: "grounded_reasoning", input }); }
export async function runAlignmentCheck(input: string) { return agiCall("emma-causal-engine", { action: "alignment_check", input }); }
export async function runSelfAwarenessProbe() { return agiCall("emma-causal-engine", { action: "self_awareness" }); }
export async function runAgentSwarm(input: string, agents?: string[]) { return agiCall("emma-multi-agent", { action: "swarm", input, agents }); }
export async function getAvailableAgents() { return agiCall("emma-multi-agent", { action: "agents" }); }

// Admin Learning API
export async function getAdminDashboard() { return agiCall("emma-admin-learn", { action: "get_dashboard" }); }
export async function aggregateData() { return agiCall("emma-admin-learn", { action: "aggregate_data" }); }
export async function extractPatterns() { return agiCall("emma-admin-learn", { action: "extract_patterns" }); }
export async function generateImprovement() { return agiCall("emma-admin-learn", { action: "generate_improvement" }); }
export async function applyImprovement(prompt_text: string, source_pattern_ids?: string[]) { return agiCall("emma-admin-learn", { action: "apply_improvement", prompt_text, source_pattern_ids }); }
export async function massImprove() { return agiCall("emma-admin-learn", { action: "mass_improve" }); }
export async function checkAdmin() { return agiCall("emma-db-proxy", { action: "check_admin" }); }

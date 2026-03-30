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

// World Model API
export async function getWorldModel() { return agiCall("emma-world-model", { action: "get_state" }); }
export async function updateWorldModel(observations: string) { return agiCall("emma-world-model", { action: "update_state", observations }); }
export async function queryWorldModel(query: string) { return agiCall("emma-world-model", { action: "query_state", query }); }
export async function maintainWorldModel() { return agiCall("emma-world-model", { action: "maintain_state" }); }

// Metacognitive Logs API
export async function getMetacognitiveLogs(loopId?: string) { return agiCall("emma-db-proxy", { action: "get_metacognitive_logs", loopId }); }

// Formal Safety Verification API
export async function verifyInvariants(content: string) { return agiCall("emma-formal-safety", { action: "verify_invariants", content }); }
export async function verifyTemporal(history: any[]) { return agiCall("emma-formal-safety", { action: "verify_temporal", history }); }
export async function fullSafetyVerification(content: string, history?: any[]) { return agiCall("emma-formal-safety", { action: "full_verification", content, history }); }
export async function getSafetyHistory() { return agiCall("emma-formal-safety", { action: "get_history" }); }

// Transfer Learning API
export async function extractKnowledge(content: string, source_domain: string) { return agiCall("emma-transfer-sensory", { action: "extract_knowledge", content, source_domain }); }
export async function transferKnowledge(content: string, target_domain: string) { return agiCall("emma-transfer-sensory", { action: "transfer", content, target_domain }); }
export async function getKnowledgeBase() { return agiCall("emma-transfer-sensory", { action: "get_knowledge_base" }); }

// Sensory Grounding API
export async function groundVisual(image_url: string, content?: string) { return agiCall("emma-transfer-sensory", { action: "ground_visual", image_url, content }); }
export async function groundText(content: string) { return agiCall("emma-transfer-sensory", { action: "ground_text", content }); }
export async function getSensoryHistory() { return agiCall("emma-transfer-sensory", { action: "get_sensory_history" }); }
export async function fuseModalities(inputs: { text?: string; image_url?: string; audio_description?: string }) { return agiCall("emma-transfer-sensory", { action: "fuse_modalities", inputs }); }

// Autonomous Loop API
export async function getAutonomousRuns() { return agiCall("emma-autonomous-loop", { action: "get_runs", user_id: "self" }); }

// Admin Learning API
export async function getAdminDashboard() { return agiCall("emma-admin-learn", { action: "get_dashboard" }); }
export async function aggregateData() { return agiCall("emma-admin-learn", { action: "aggregate_data" }); }
export async function extractPatterns() { return agiCall("emma-admin-learn", { action: "extract_patterns" }); }
export async function generateImprovement() { return agiCall("emma-admin-learn", { action: "generate_improvement" }); }
export async function applyImprovement(prompt_text: string, source_pattern_ids?: string[]) { return agiCall("emma-admin-learn", { action: "apply_improvement", prompt_text, source_pattern_ids }); }
export async function massImprove() { return agiCall("emma-admin-learn", { action: "mass_improve" }); }
export async function checkAdmin() { return agiCall("emma-db-proxy", { action: "check_admin" }); }

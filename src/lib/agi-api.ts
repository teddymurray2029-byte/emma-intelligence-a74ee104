import { supabase } from "@/integrations/supabase/client";

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function agiCall(fn: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || API_KEY;

  const resp = await fetch(`${BASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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

// Benchmark Engine
export async function runBenchmarks(category = "all") {
  return agiCall("emma-benchmark", { action: "run", category });
}

export async function getBenchmarkHistory() {
  return agiCall("emma-benchmark", { action: "history" });
}

// Self-Improvement Engine
export async function analyzeSelfImprovement() {
  return agiCall("emma-self-improve", { action: "analyze" });
}

export async function applySelfImprovement() {
  return agiCall("emma-self-improve", { action: "apply" });
}

// Goals & Memory
export async function getGoals() {
  return agiCall("emma-self-improve", { action: "goals" });
}

export async function getMemoryEpisodes() {
  return agiCall("emma-self-improve", { action: "memory" });
}

// Orchestrator
export async function runCognitiveLoop(input: string) {
  return agiCall("emma-orchestrator", { action: "run_loop", input });
}

export async function getSystemStatus() {
  return agiCall("emma-orchestrator", { action: "status" });
}

// Safety
export async function validateContent(content: string, contentType: "code" | "prompt") {
  return agiCall("emma-safety", { action: "validate", content, contentType });
}

export async function getHealthCheck() {
  return agiCall("emma-safety", { action: "health" });
}

// Causal Engine (Phase 1A)
export async function runCausalInference(input: string) {
  return agiCall("emma-causal-engine", { action: "causal_inference", input });
}

export async function runArchitecturalAnalysis() {
  return agiCall("emma-causal-engine", { action: "architectural_analysis" });
}

export async function runGroundedReasoning(input: string) {
  return agiCall("emma-causal-engine", { action: "grounded_reasoning", input });
}

export async function runAlignmentCheck(input: string) {
  return agiCall("emma-causal-engine", { action: "alignment_check", input });
}

export async function runSelfAwarenessProbe() {
  return agiCall("emma-causal-engine", { action: "self_awareness" });
}

// Multi-Agent Swarm
export async function runAgentSwarm(input: string, agents?: string[]) {
  return agiCall("emma-multi-agent", { action: "swarm", input, agents });
}

export async function getAvailableAgents() {
  return agiCall("emma-multi-agent", { action: "agents" });
}

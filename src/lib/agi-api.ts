const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function agiCall(fn: string, body: Record<string, unknown>) {
  const resp = await fetch(`${BASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `Error ${resp.status}`);
  }
  return resp.json();
}

export async function runBenchmarks(category = "all") {
  return agiCall("emma-benchmark", { action: "run", category });
}

export async function getBenchmarkHistory() {
  return agiCall("emma-benchmark", { action: "history" });
}

export async function analyzeSelfImprovement() {
  return agiCall("emma-self-improve", { action: "analyze" });
}

export async function applySelfImprovement() {
  return agiCall("emma-self-improve", { action: "apply" });
}

export async function getGoals() {
  return agiCall("emma-self-improve", { action: "goals" });
}

export async function getMemoryEpisodes() {
  return agiCall("emma-self-improve", { action: "memory" });
}

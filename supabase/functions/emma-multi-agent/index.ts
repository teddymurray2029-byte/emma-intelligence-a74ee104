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
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", max_tokens: 8192, messages: [{ role: "system", content: system }, { role: "user", content: userContent }] }),
  });
  if (!resp.ok) throw new Error(`AI failed: ${resp.status}`);
  return (await resp.json()).choices?.[0]?.message?.content || "";
}

const AGENTS = [
  { id: "analyst", name: "Analyst", role: "Deep analysis", prompt: `You are the Analyst. First-principles reasoning. Return JSON: {"analysis": "...", "firstPrinciples": [...], "confidence": 0-1}` },
  { id: "critic", name: "Critic", role: "Adversarial review", prompt: `You are the Critic. Find flaws. Return JSON: {"critique": "...", "flaws": [...], "confidence": 0-1}` },
  { id: "synthesizer", name: "Synthesizer", role: "Integration", prompt: `You are the Synthesizer. Find connections. Return JSON: {"synthesis": "...", "connections": [...], "confidence": 0-1}` },
  { id: "validator", name: "Validator", role: "Verification", prompt: `You are the Validator. Check facts. Return JSON: {"validation": "...", "factChecks": [...], "reliability": 0-1, "confidence": 0-1}` },
  { id: "meta", name: "Meta-Cognition", role: "Oversee", prompt: `You are Meta-Cognition. Synthesize all agent outputs. Return JSON: {"finalAnswer": "...", "overallConfidence": 0-1, "qualityScore": 0-10}` },
];

async function runAgent(apiKey: string, agent: typeof AGENTS[0], task: string, context: string) {
  const start = Date.now();
  const userContent = `Task: ${task}\n${context ? `Context:\n${context}` : ""}`;
  const output = await callAI(apiKey, agent.prompt, userContent);
  let confidence = 0.5;
  try { const p = JSON.parse(output.replace(/```json\n?/g, "").replace(/```/g, "").trim()); confidence = p.confidence || p.reliability || p.overallConfidence || 0.5; } catch {}
  return { agent: agent.id, role: agent.role, output, confidence, duration: Date.now() - start };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, input, agents: requestedAgents } = await req.json();

    if (action === "swarm") {
      if (!input) return new Response(JSON.stringify({ error: "Input required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const activeAgents = requestedAgents ? AGENTS.filter(a => requestedAgents.includes(a.id)) : AGENTS;
      const results: any[] = [];
      const log: string[] = [];

      // Cross-agent memory: load shared context from previous swarms
      const { data: sharedMemories } = await supabase
        .from("memory_episodes")
        .select("content, created_at")
        .eq("user_id", userId)
        .eq("episode_type", "agent_shared")
        .order("created_at", { ascending: false })
        .limit(10);
      const sharedCtx = (sharedMemories || []).map((m: any) => m.content).join("\n");
      if (sharedCtx) log.push(`[SHARED_MEMORY] Loaded ${sharedMemories!.length} cross-agent memories`);

      const phase1 = activeAgents.filter(a => ["analyst", "critic", "synthesizer"].includes(a.id));
      const phase1Results = await Promise.all(phase1.map(a => runAgent(LOVABLE_API_KEY, a, input, sharedCtx)));
      results.push(...phase1Results);
      phase1Results.forEach(r => log.push(`[${r.agent.toUpperCase()}] ${r.duration}ms, conf: ${r.confidence.toFixed(2)}`));

      const validator = activeAgents.find(a => a.id === "validator");
      if (validator) {
        const ctx = phase1Results.map(r => `[${r.agent}]: ${r.output.slice(0, 500)}`).join("\n\n") + (sharedCtx ? `\n\n[SHARED MEMORY]:\n${sharedCtx}` : "");
        const vr = await runAgent(LOVABLE_API_KEY, validator, input, ctx);
        results.push(vr);
        log.push(`[VALIDATOR] ${vr.duration}ms`);
      }

      const meta = activeAgents.find(a => a.id === "meta");
      let finalOutput = "";
      if (meta) {
        const ctx = results.map(r => `[${r.agent}]: ${r.output.slice(0, 600)}`).join("\n\n");
        const mr = await runAgent(LOVABLE_API_KEY, meta, input, ctx);
        results.push(mr);
        finalOutput = mr.output;
      } else finalOutput = results.map(r => r.output).join("\n\n");

      const avgConfidence = results.reduce((s, r) => s + r.confidence, 0) / results.length;

      // Store key findings as shared memory for future swarms
      await supabase.from("memory_episodes").insert({
        user_id: userId, episode_type: "agent_shared",
        content: `[SWARM_RESULT] Task: "${input.slice(0, 80)}". Confidence: ${avgConfidence.toFixed(2)}. Key: ${finalOutput.slice(0, 200)}`,
        relevance_score: Math.round(avgConfidence * 10),
        embedding_key: `swarm:${Date.now()}`,
      });
      log.push(`[SHARED_MEMORY] Stored swarm result for cross-agent recall`);

      await supabase.from("memory_episodes").insert({ user_id: userId, episode_type: "multi_agent_swarm", content: `Swarm: "${input.slice(0, 100)}". ${results.length} agents. Conf: ${avgConfidence.toFixed(2)}`, relevance_score: Math.round(avgConfidence * 10) });

      return new Response(JSON.stringify({ finalOutput, agentResults: results, log, sharedMemoryUsed: (sharedMemories || []).length, metrics: { totalDuration: results.reduce((s, r) => s + r.duration, 0), avgConfidence, agentCount: results.length } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "agents") {
      return new Response(JSON.stringify({ agents: AGENTS.map(a => ({ id: a.id, name: a.name, role: a.role })) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cross-agent memory sharing: agents can read/write shared memory
    if (action === "share_memory") {
      const { memory_key, memory_value, agent_id } = await req.json().catch(() => ({}));
      if (!memory_key || !memory_value) return new Response(JSON.stringify({ error: "memory_key and memory_value required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      await supabase.from("memory_episodes").insert({
        user_id: userId, episode_type: "agent_shared",
        content: `[AGENT:${agent_id || "unknown"}] ${memory_key}: ${memory_value}`,
        relevance_score: 8,
        embedding_key: `agent_shared:${memory_key}`,
      });
      return new Response(JSON.stringify({ stored: true, key: memory_key }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "recall_shared") {
      const { data: sharedMemories } = await supabase
        .from("memory_episodes")
        .select("content, created_at, embedding_key")
        .eq("user_id", userId)
        .eq("episode_type", "agent_shared")
        .order("created_at", { ascending: false })
        .limit(20);
      return new Response(JSON.stringify({ memories: sharedMemories || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("multi-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

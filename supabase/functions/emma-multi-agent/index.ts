import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));

async function getClerkUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try { const { payload } = await jwtVerify(token, JWKS); return (payload.sub as string) || null; } catch { return null; }
}

async function callAI(apiKey: string, messages: any[]): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", messages }) });
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
  const output = await callAI(apiKey, [{ role: "system", content: agent.prompt }, { role: "user", content: `Task: ${task}\n${context ? `Context:\n${context}` : ""}` }]);
  let confidence = 0.5;
  try { const p = JSON.parse(output.replace(/```json\n?/g, "").replace(/```/g, "").trim()); confidence = p.confidence || p.reliability || p.overallConfidence || 0.5; } catch {}
  return { agent: agent.id, role: agent.role, output, confidence, duration: Date.now() - start };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, input, agents: requestedAgents } = await req.json();

    if (action === "swarm") {
      if (!input) return new Response(JSON.stringify({ error: "Input required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const activeAgents = requestedAgents ? AGENTS.filter(a => requestedAgents.includes(a.id)) : AGENTS;
      const results: any[] = [];
      const log: string[] = [];

      const phase1 = activeAgents.filter(a => ["analyst", "critic", "synthesizer"].includes(a.id));
      const phase1Results = await Promise.all(phase1.map(a => runAgent(OPENAI_API_KEY, a, input, "")));
      results.push(...phase1Results);
      phase1Results.forEach(r => log.push(`[${r.agent.toUpperCase()}] ${r.duration}ms, conf: ${r.confidence.toFixed(2)}`));

      const validator = activeAgents.find(a => a.id === "validator");
      if (validator) {
        const ctx = phase1Results.map(r => `[${r.agent}]: ${r.output.slice(0, 500)}`).join("\n\n");
        const vr = await runAgent(OPENAI_API_KEY, validator, input, ctx);
        results.push(vr);
        log.push(`[VALIDATOR] ${vr.duration}ms`);
      }

      const meta = activeAgents.find(a => a.id === "meta");
      let finalOutput = "";
      if (meta) {
        const ctx = results.map(r => `[${r.agent}]: ${r.output.slice(0, 600)}`).join("\n\n");
        const mr = await runAgent(OPENAI_API_KEY, meta, input, ctx);
        results.push(mr);
        finalOutput = mr.output;
      } else finalOutput = results.map(r => r.output).join("\n\n");

      const avgConfidence = results.reduce((s, r) => s + r.confidence, 0) / results.length;
      await supabase.from("memory_episodes").insert({ user_id: userId, episode_type: "multi_agent_swarm", content: `Swarm: "${input.slice(0, 100)}". ${results.length} agents. Conf: ${avgConfidence.toFixed(2)}`, relevance_score: Math.round(avgConfidence * 10) });

      return new Response(JSON.stringify({ finalOutput, agentResults: results, log, metrics: { totalDuration: results.reduce((s, r) => s + r.duration, 0), avgConfidence, agentCount: results.length } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "agents") {
      return new Response(JSON.stringify({ agents: AGENTS.map(a => ({ id: a.id, name: a.name, role: a.role })) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("multi-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

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

interface AgentResult {
  agent: string;
  role: string;
  output: string;
  confidence: number;
  duration: number;
}

// Multi-agent swarm: each agent has a specialized role
const AGENTS = [
  {
    id: "analyst",
    name: "Analyst",
    role: "Deep domain analysis and first-principles reasoning",
    prompt: `You are the Analyst agent. Your role is deep domain analysis using first-principles reasoning.
- Break problems down to fundamental truths
- Identify assumptions and test them
- Provide structured analysis with evidence
- Rate your confidence 0-1
Return JSON: {"analysis": "...", "firstPrinciples": ["..."], "assumptions": ["..."], "confidence": 0-1}`,
  },
  {
    id: "critic",
    name: "Critic",
    role: "Adversarial review and weakness identification",
    prompt: `You are the Critic agent. Find flaws, weaknesses, and blind spots.
- Challenge every assumption
- Identify edge cases and failure modes
- Propose counterarguments
- Rate severity of issues found
Return JSON: {"critique": "...", "flaws": [{"issue": "...", "severity": "critical|high|medium|low"}], "counterarguments": ["..."], "confidence": 0-1}`,
  },
  {
    id: "synthesizer",
    name: "Synthesizer",
    role: "Integration and novel connection discovery",
    prompt: `You are the Synthesizer agent. Find novel connections and integrate perspectives.
- Connect ideas across domains
- Identify emergent patterns
- Propose creative solutions
- Build unified frameworks
Return JSON: {"synthesis": "...", "connections": [{"from": "...", "to": "...", "insight": "..."}], "emergentPatterns": ["..."], "novelSolutions": ["..."], "confidence": 0-1}`,
  },
  {
    id: "validator",
    name: "Validator",
    role: "Fact-checking, consistency verification, and safety review",
    prompt: `You are the Validator agent. Verify facts, check consistency, and ensure safety.
- Fact-check claims against known knowledge
- Check logical consistency
- Verify alignment with safety constraints
- Assess overall reliability
Return JSON: {"validation": "...", "factChecks": [{"claim": "...", "verdict": "verified|unverified|false", "evidence": "..."}], "consistencyIssues": ["..."], "safetyFlags": ["..."], "reliability": 0-1, "confidence": 0-1}`,
  },
  {
    id: "meta",
    name: "Meta-Cognition",
    role: "Oversee agent coordination, resolve conflicts, produce final output",
    prompt: `You are the Meta-Cognition agent. You oversee the entire multi-agent process.
Given outputs from Analyst, Critic, Synthesizer, and Validator:
- Resolve conflicts between agents
- Weigh confidence levels
- Produce a unified, high-quality final answer
- Track which agents contributed most
Return JSON: {"finalAnswer": "...", "conflictsResolved": [{"conflict": "...", "resolution": "..."}], "agentWeights": {"analyst": 0-1, "critic": 0-1, "synthesizer": 0-1, "validator": 0-1}, "overallConfidence": 0-1, "qualityScore": 0-10, "reasoning": "..."}`,
  },
];

async function runAgent(apiKey: string, agent: typeof AGENTS[0], task: string, context: string): Promise<AgentResult> {
  const start = Date.now();
  const output = await callAI(apiKey, [
    { role: "system", content: agent.prompt },
    { role: "user", content: `Task: ${task}\n${context ? `Context from other agents:\n${context}` : ""}` },
  ]);

  let confidence = 0.5;
  try {
    const parsed = JSON.parse(output.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    confidence = parsed.confidence || parsed.reliability || parsed.overallConfidence || 0.5;
  } catch {}

  return {
    agent: agent.id,
    role: agent.role,
    output,
    confidence,
    duration: Date.now() - start,
  };
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

    const { action, input, agents: requestedAgents } = await req.json();

    if (action === "swarm") {
      if (!input) return new Response(JSON.stringify({ error: "Input required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const activeAgents = requestedAgents
        ? AGENTS.filter(a => requestedAgents.includes(a.id))
        : AGENTS;

      const log: string[] = [];
      const results: AgentResult[] = [];

      // Phase 1: Run analyst, critic, synthesizer in parallel
      const phase1Agents = activeAgents.filter(a => ["analyst", "critic", "synthesizer"].includes(a.id));
      log.push(`[SWARM] Dispatching ${phase1Agents.length} phase-1 agents in parallel...`);

      const phase1Results = await Promise.all(
        phase1Agents.map(a => runAgent(LOVABLE_API_KEY, a, input, ""))
      );
      results.push(...phase1Results);
      phase1Results.forEach(r => {
        log.push(`[${r.agent.toUpperCase()}] Complete (${r.duration}ms, confidence: ${r.confidence.toFixed(2)})`);
      });

      // Phase 2: Validator reviews all phase 1 outputs
      const validatorAgent = activeAgents.find(a => a.id === "validator");
      if (validatorAgent) {
        const context = phase1Results.map(r => `[${r.agent}]: ${r.output.slice(0, 500)}`).join("\n\n");
        log.push("[VALIDATOR] Reviewing all agent outputs...");
        const validatorResult = await runAgent(LOVABLE_API_KEY, validatorAgent, input, context);
        results.push(validatorResult);
        log.push(`[VALIDATOR] Complete (${validatorResult.duration}ms, confidence: ${validatorResult.confidence.toFixed(2)})`);
      }

      // Phase 3: Meta-cognition synthesizes everything
      const metaAgent = activeAgents.find(a => a.id === "meta");
      let finalOutput = "";
      if (metaAgent) {
        const allContext = results.map(r => `[${r.agent}]: ${r.output.slice(0, 600)}`).join("\n\n");
        log.push("[META] Synthesizing all agent outputs...");
        const metaResult = await runAgent(LOVABLE_API_KEY, metaAgent, input, allContext);
        results.push(metaResult);
        finalOutput = metaResult.output;
        log.push(`[META] Complete (${metaResult.duration}ms, confidence: ${metaResult.confidence.toFixed(2)})`);
      } else {
        finalOutput = results.map(r => r.output).join("\n\n");
      }

      const totalDuration = results.reduce((s, r) => s + r.duration, 0);
      const avgConfidence = results.reduce((s, r) => s + r.confidence, 0) / results.length;
      log.push(`[SWARM] Complete. ${results.length} agents, ${totalDuration}ms total, avg confidence: ${avgConfidence.toFixed(2)}`);

      // Store in memory
      await supabase.from("memory_episodes").insert({
        user_id: user.id, episode_type: "multi_agent_swarm",
        content: `Swarm task: "${input.slice(0, 100)}". ${results.length} agents. Avg confidence: ${avgConfidence.toFixed(2)}`,
        relevance_score: Math.round(avgConfidence * 10),
      });

      return new Response(JSON.stringify({
        finalOutput,
        agentResults: results.map(r => ({
          agent: r.agent,
          role: r.role,
          output: r.output,
          confidence: r.confidence,
          duration: r.duration,
        })),
        log,
        metrics: { totalDuration, avgConfidence, agentCount: results.length },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "agents") {
      return new Response(JSON.stringify({
        agents: AGENTS.map(a => ({ id: a.id, name: a.name, role: a.role })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: swarm, agents" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("multi-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

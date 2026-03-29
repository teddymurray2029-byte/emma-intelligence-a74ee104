import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));

async function getClerkUserId(req: Request): Promise<string> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return "anonymous";
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return "anonymous";
  try { const { payload } = await jwtVerify(token, JWKS); return (payload.sub as string) || "anonymous"; } catch { return "anonymous"; }
}

async function callClaudeStructured(apiKey: string, system: string, userContent: string, toolSchema: any): Promise<any> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: userContent }],
      tools: [{
        name: toolSchema.name,
        description: toolSchema.description,
        input_schema: toolSchema.parameters,
      }],
      tool_choice: { type: "tool", name: toolSchema.name },
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const toolUse = data.content?.find((c: any) => c.type === "tool_use");
  return toolUse?.input || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { objective } = await req.json();
    if (!objective) return new Response(JSON.stringify({ error: "Research objective required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");
    if (!CLAUDE_API_KEY) throw new Error("CLAUDE_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);

    const plan = await callClaudeStructured(CLAUDE_API_KEY, "Break research objective into 3-5 questions.", `Research: ${objective}`, { name: "create_research_plan", description: "Create plan", parameters: { type: "object", properties: { clarifiedObjective: { type: "string" }, questions: { type: "array", items: { type: "string" } }, expectedSourceTypes: { type: "array", items: { type: "string" } } }, required: ["clarifiedObjective", "questions", "expectedSourceTypes"] } }) || { clarifiedObjective: objective, questions: [objective], expectedSourceTypes: ["web"] };

    const researchResults: any[] = [];
    for (const question of plan.questions.slice(0, 5)) {
      const findings = await callClaudeStructured(CLAUDE_API_KEY, "Research analyst. Provide findings with sources.", `Question: ${question}\nContext: "${plan.clarifiedObjective}"`, { name: "provide_findings", description: "Findings", parameters: { type: "object", properties: { findings: { type: "string" }, sources: { type: "array", items: { type: "object", properties: { title: { type: "string" }, snippet: { type: "string" }, confidence: { type: "number" } }, required: ["title", "snippet", "confidence"] } } }, required: ["findings", "sources"] } });
      if (findings) researchResults.push({ question, findings: findings.findings, sources: findings.sources || [] });
    }

    const allFindings = researchResults.map((r, i) => `## Q${i + 1}: ${r.question}\n${r.findings}\nSources: ${r.sources.map((s: any) => `- ${s.title}: ${s.snippet}`).join("\n")}`).join("\n---\n");
    const synthesis = await callClaudeStructured(CLAUDE_API_KEY, "Synthesize research into comprehensive report.", `Objective: ${plan.clarifiedObjective}\nFindings:\n${allFindings}`, { name: "synthesize_report", description: "Synthesize", parameters: { type: "object", properties: { executiveSummary: { type: "string" }, fullReport: { type: "string" }, openQuestions: { type: "array", items: { type: "string" } }, confidenceScore: { type: "number" }, keyInsights: { type: "array", items: { type: "string" } } }, required: ["executiveSummary", "fullReport", "openQuestions", "confidenceScore"] } });

    const allSources = researchResults.flatMap((r, qi) => r.sources.map((s: any, si: number) => ({ id: qi * 10 + si + 1, title: s.title, snippet: s.snippet, source: "web", confidence: s.confidence })));

    if (userId !== "anonymous") {
      await supabase.from("memory_episodes").insert({ user_id: userId, episode_type: "research", content: `Researched: "${objective}". ${allSources.length} sources. Confidence: ${synthesis?.confidenceScore || 0}%`, relevance_score: 7 });
    }

    return new Response(JSON.stringify({ id: crypto.randomUUID(), objective: plan.clarifiedObjective, status: "complete", plan: plan.questions, currentStep: plan.questions.length, sources: allSources, summary: synthesis?.executiveSummary || "Complete.", fullReport: synthesis?.fullReport || allFindings, openQuestions: synthesis?.openQuestions || [], confidence: synthesis?.confidenceScore || 50, keyInsights: synthesis?.keyInsights || [], createdAt: new Date().toISOString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("research error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

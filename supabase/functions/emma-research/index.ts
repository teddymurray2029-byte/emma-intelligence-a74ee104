import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callAI(apiKey: string, messages: any[]): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
  });
  if (!resp.ok) return "";
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callAIStructured(apiKey: string, messages: any[], schema: any): Promise<any> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      tools: [{
        type: "function",
        function: schema,
      }],
      tool_choice: { type: "function", function: { name: schema.name } },
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;
  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { objective } = await req.json();
    if (!objective) {
      return new Response(JSON.stringify({ error: "Research objective required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    let userId = "anonymous";
    if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    }

    // Step 1: Generate research plan
    const planResult = await callAIStructured(LOVABLE_API_KEY, [
      { role: "system", content: "You are a research planning agent. Break down a research objective into 3-5 concrete research questions to investigate." },
      { role: "user", content: `Research objective: ${objective}` },
    ], {
      name: "create_research_plan",
      description: "Create a structured research plan",
      parameters: {
        type: "object",
        properties: {
          clarifiedObjective: { type: "string", description: "Clarified version of the research objective" },
          questions: {
            type: "array",
            items: { type: "string" },
            description: "3-5 specific research questions to investigate",
          },
          expectedSourceTypes: {
            type: "array",
            items: { type: "string" },
            description: "Types of sources that would be most relevant",
          },
        },
        required: ["clarifiedObjective", "questions", "expectedSourceTypes"],
        additionalProperties: false,
      },
    });

    const plan = planResult || {
      clarifiedObjective: objective,
      questions: [objective],
      expectedSourceTypes: ["web", "academic"],
    };

    // Step 2: Research each question deeply
    const researchResults: { question: string; findings: string; sources: { title: string; snippet: string; confidence: number }[] }[] = [];

    for (const question of plan.questions.slice(0, 5)) {
      const findingsResult = await callAIStructured(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `You are a research analyst. For the given question, provide detailed findings with specific facts, data points, and source-quality information. Be thorough and cite specific concepts. Mark any uncertain claims.`,
        },
        { role: "user", content: `Research question: ${question}\n\nContext: Part of a broader investigation into "${plan.clarifiedObjective}"` },
      ], {
        name: "provide_findings",
        description: "Provide research findings with sources",
        parameters: {
          type: "object",
          properties: {
            findings: { type: "string", description: "Detailed research findings with specific facts" },
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  snippet: { type: "string", description: "Key relevant quote or data point" },
                  confidence: { type: "number", description: "Confidence 0-1 in this source's reliability" },
                },
                required: ["title", "snippet", "confidence"],
                additionalProperties: false,
              },
            },
            uncertainAreas: {
              type: "array",
              items: { type: "string" },
              description: "Areas where evidence is uncertain or conflicting",
            },
          },
          required: ["findings", "sources"],
          additionalProperties: false,
        },
      });

      if (findingsResult) {
        researchResults.push({
          question,
          findings: findingsResult.findings,
          sources: findingsResult.sources || [],
        });
      }
    }

    // Step 3: Synthesize into report
    const allFindings = researchResults.map((r, i) =>
      `## Question ${i + 1}: ${r.question}\n\n${r.findings}\n\nSources: ${r.sources.map(s => `- ${s.title}: ${s.snippet}`).join("\n")}`
    ).join("\n\n---\n\n");

    const synthesisResult = await callAIStructured(LOVABLE_API_KEY, [
      {
        role: "system",
        content: `You are a senior research synthesist. Given multiple research findings, produce a comprehensive research report. Include an executive summary, detailed analysis, and clear conclusions. Every factual claim must reference which finding/source it comes from using [Source N] notation. Identify open questions and confidence levels.`,
      },
      {
        role: "user",
        content: `Research objective: ${plan.clarifiedObjective}\n\nFindings:\n${allFindings}`,
      },
    ], {
      name: "synthesize_report",
      description: "Synthesize research into a comprehensive report",
      parameters: {
        type: "object",
        properties: {
          executiveSummary: { type: "string", description: "2-3 sentence executive summary" },
          fullReport: { type: "string", description: "Full detailed report in markdown with [Source N] citations" },
          openQuestions: {
            type: "array",
            items: { type: "string" },
            description: "Unresolved questions for further research",
          },
          confidenceScore: { type: "number", description: "Overall confidence in findings 0-100" },
          keyInsights: {
            type: "array",
            items: { type: "string" },
            description: "3-5 key insights from the research",
          },
        },
        required: ["executiveSummary", "fullReport", "openQuestions", "confidenceScore"],
        additionalProperties: false,
      },
    });

    // Build citation list
    const allSources = researchResults.flatMap((r, qi) =>
      r.sources.map((s, si) => ({
        id: qi * 10 + si + 1,
        title: s.title,
        snippet: s.snippet,
        source: "web" as const,
        confidence: s.confidence,
      }))
    );

    // Store as episodic memory
    if (userId !== "anonymous") {
      await supabase.from("memory_episodes").insert({
        user_id: userId,
        episode_type: "research",
        content: `Researched: "${objective}". Found ${allSources.length} sources. Confidence: ${synthesisResult?.confidenceScore || 0}%. Summary: ${synthesisResult?.executiveSummary?.slice(0, 200) || "N/A"}`,
        relevance_score: 7,
      });
    }

    const report = {
      id: crypto.randomUUID(),
      objective: plan.clarifiedObjective,
      status: "complete",
      plan: plan.questions,
      currentStep: plan.questions.length,
      sources: allSources,
      summary: synthesisResult?.executiveSummary || "Research complete.",
      fullReport: synthesisResult?.fullReport || allFindings,
      openQuestions: synthesisResult?.openQuestions || [],
      confidence: synthesisResult?.confidenceScore || 50,
      keyInsights: synthesisResult?.keyInsights || [],
      createdAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("emma-research error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Research failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

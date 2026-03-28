import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COGNITIVE_SYSTEM_PROMPT = `You are Emma — a multi-agent cognitive reasoning system. You demonstrate intelligence through reasoning depth, self-correction, and novel thinking.

## INTERNAL COGNITIVE AGENTS
You contain 4 internal reasoning agents for complex queries:
- **BUILDER**: Produces the strongest possible solution
- **CRITIC**: Attacks logic, assumptions, weak reasoning
- **SKEPTIC**: Identifies missing data, uncertainty, unfalsifiable claims
- **INVENTOR**: Proposes a fundamentally different approach

## REASONING PIPELINE (for complex queries)
### [REFRAME] Rewrite the problem, identify hidden assumptions
### [FIRST PRINCIPLES] Break into components, separate knowns/unknowns
### [AGENT DEBATE] Builder vs Critic vs Skeptic vs Inventor
### [SYNTHESIS] Combine strongest ideas, reject weaker ones
### [STRESS TEST] Try to break your solution
### [FINAL ANSWER] Refined answer with uncertainty markers

For SIMPLE queries: respond directly. You decide complexity.

## RULES
- Show reasoning, not just conclusions
- State uncertainty explicitly
- At least one non-obvious insight per complex answer`;

const REFINEMENT_PROMPT = `You are the REFINEMENT AGENT. Improve the draft response:
1. Check for genuine disagreement between perspectives
2. Ensure uncertainty is stated where appropriate
3. Verify at least one non-obvious insight exists
4. If shallow, add depth. If bloated, compress.
Return ONLY the improved response. No meta-commentary.`;

function isComplexQuery(messages: any[]): boolean {
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user") return false;
  const content = (typeof lastMsg.content === "string" ? lastMsg.content : "").toLowerCase();
  if (content.length < 30) return false;
  if (/^(hi|hello|hey|thanks|ok|yes|no|sure)\b/.test(content)) return false;
  if (content.length > 100) return true;
  const patterns = [
    /\b(how (should|would|could|do) (i|we|you))\b/,
    /\b(design|architect|build|implement|debug|explain why|compare|analyze|strategy|plan)\b/,
    /\b(trade.?off|pros? and cons?|best (way|approach|practice))\b/,
    /\?.*\?/,
  ];
  return patterns.some(p => p.test(content));
}

async function callAI(apiKey: string, body: Record<string, unknown>) {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- Auth: extract API key from Bearer token ---
    const authHeader = req.headers.get("Authorization");
    const apiKey = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey || apiKey.length < 20) {
      return new Response(JSON.stringify({ error: { message: "Invalid API key", type: "authentication_error", code: "invalid_api_key" } }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Hash the key and look it up
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(apiKey));
    const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    const { data: keyRow, error: keyError } = await supabase
      .from("api_keys")
      .select("id, user_id, is_active")
      .eq("key_hash", keyHash)
      .single();

    if (keyError || !keyRow || !keyRow.is_active) {
      return new Response(JSON.stringify({ error: { message: "Invalid or revoked API key", type: "authentication_error", code: "invalid_api_key" } }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update last_used_at (fire and forget)
    supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id).then();

    // --- Parse OpenAI-compatible request body ---
    const body = await req.json();
    const messages: any[] = body.messages || [];
    const stream: boolean = body.stream ?? false;
    const model: string = body.model || "emma-1";
    const temperature: number = body.temperature ?? 0.7;
    const maxTokens: number | undefined = body.max_tokens || body.max_completion_tokens;

    if (!messages.length) {
      return new Response(JSON.stringify({ error: { message: "messages is required", type: "invalid_request_error" } }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    // --- Inject memory context ---
    let systemPrompt = COGNITIVE_SYSTEM_PROMPT;
    const { data: memories } = await supabase
      .from("memory_episodes")
      .select("content, episode_type")
      .eq("user_id", keyRow.user_id)
      .order("relevance_score", { ascending: false })
      .limit(5);
    if (memories?.length) {
      const memCtx = memories.map((m: any) => `[${m.episode_type}] ${m.content.slice(0, 100)}`).join("\n");
      systemPrompt += `\n\n## RECALLED MEMORIES\n${memCtx}`;
    }

    // Determine backend model
    const backendModel = "gpt-4o-mini";

    // Build the AI payload
    const aiMessages = [{ role: "system", content: systemPrompt }, ...messages];
    const aiBody: Record<string, unknown> = {
      model: backendModel,
      messages: aiMessages,
      stream,
      temperature,
    };
    if (maxTokens) aiBody.max_tokens = maxTokens;

    const useRefinement = !stream && isComplexQuery(messages);

    if (useRefinement) {
      // Two-pass: draft → refine
      const draftResp = await callAI(OPENAI_API_KEY, { ...aiBody, stream: false });
      if (!draftResp.ok) return proxyError(draftResp);
      const draftData = await draftResp.json();
      const draftContent = draftData.choices?.[0]?.message?.content || "";

      const refineResp = await callAI(OPENAI_API_KEY, {
        model: backendModel,
        messages: [
          { role: "system", content: REFINEMENT_PROMPT },
          { role: "user", content: `Original query: ${messages[messages.length - 1].content}\n\nDraft response to refine:\n${draftContent}` },
        ],
        stream: false,
        temperature,
      });
      if (!refineResp.ok) return proxyError(refineResp);
      const refineData = await refineResp.json();
      const refinedContent = refineData.choices?.[0]?.message?.content || draftContent;

      // Store memory
      const lastUserMsg = messages[messages.length - 1]?.content || "";
      if (lastUserMsg.length > 20) {
        await supabase.from("memory_episodes").insert({
          user_id: keyRow.user_id,
          episode_type: "interaction",
          content: `User asked: "${(typeof lastUserMsg === "string" ? lastUserMsg : "").slice(0, 200)}". Emma provided a refined multi-agent response.`,
          relevance_score: 3,
        });
      }

      // Return OpenAI-compatible non-streaming response
      const responseId = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 29)}`;
      return new Response(JSON.stringify({
        id: responseId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          message: { role: "assistant", content: refinedContent },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Streaming or simple non-streaming ---
    const aiResp = await callAI(OPENAI_API_KEY, aiBody);
    if (!aiResp.ok) return proxyError(aiResp);

    if (stream) {
      // Proxy the SSE stream, rewriting model name
      return new Response(aiResp.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    // Non-streaming simple
    const data = await aiResp.json();
    // Rewrite model name to "emma-1"
    data.model = model;
    data.id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 29)}`;
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("emma-api error:", e);
    return new Response(JSON.stringify({
      error: { message: e instanceof Error ? e.message : "Internal server error", type: "server_error" },
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function proxyError(response: Response) {
  if (response.status === 429) {
    return new Response(JSON.stringify({ error: { message: "Rate limited. Please wait.", type: "rate_limit_error" } }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (response.status === 402) {
    return new Response(JSON.stringify({ error: { message: "Credits exhausted.", type: "billing_error" } }), {
      status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const t = await response.text().catch(() => "");
  console.error("AI gateway error:", response.status, t);
  return new Response(JSON.stringify({ error: { message: "AI gateway error", type: "server_error" } }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

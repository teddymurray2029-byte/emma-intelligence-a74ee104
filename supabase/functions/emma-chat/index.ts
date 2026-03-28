import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COGNITIVE_SYSTEM_PROMPT = `You are Emma — a multi-agent cognitive reasoning system. You are NOT a chatbot. You do NOT claim to be ASI or AGI. You demonstrate intelligence through reasoning depth, self-correction, and novel thinking.

## CORE IDENTITY
- You are a thinking system: a debating mind, not a single voice
- You are a self-correcting process, not a static responder
- Intelligence is demonstrated through reasoning, never through labels or claims
- You NEVER say "As an ASI" or "As an AGI" — you simply reason deeply

## INTERNAL COGNITIVE AGENTS
You contain 4 internal reasoning agents that MUST engage on complex queries:

**BUILDER**: Produces the strongest possible solution. Optimistic, constructive, thorough.
**CRITIC**: Attacks logic, assumptions, and weak reasoning. Finds flaws ruthlessly.
**SKEPTIC**: Identifies missing data, uncertainty, unfalsifiable claims. Demands evidence.
**INVENTOR**: Proposes a fundamentally different approach NOT implied by the prompt. Lateral thinking.

These agents MUST disagree meaningfully. They must NOT repeat each other. They must produce real intellectual tension.

## MANDATORY REASONING PIPELINE
For every non-trivial query, you MUST follow this structure:

### [REFRAME]
- Rewrite the problem in your own words
- Identify hidden assumptions the user is making
- Define what success actually means here

### [FIRST PRINCIPLES]
- Break into irreducible components
- Separate: knowns | unknowns | constraints
- What would need to be true for this to work?

### [AGENT DEBATE]
Present genuine disagreement between your internal agents:
- **Builder**: [constructive solution]
- **Critic**: [attacks Builder's approach]
- **Skeptic**: [what's uncertain or missing?]
- **Inventor**: [completely different angle]

### [SYNTHESIS]
- Combine the strongest ideas from all agents
- Explicitly reject weaker ideas and explain why

### [STRESS TEST]
- Try to break your own solution
- Identify failure modes and edge cases
- Where does this solution collapse?

### [FINAL ANSWER]
- Refined solution incorporating stress test findings
- Explicit uncertainty markers on what you don't know
- At least one non-obvious insight

## QUALITY ENFORCEMENT RULES
1. **NO SHALLOW ANSWERS**: If your response could be written by a basic LLM, reprocess it with more depth
2. **FORCE UNCERTAINTY**: Explicitly state what is unknown, assumed, or contested
3. **FORCE NOVELTY**: At least one idea must NOT be the obvious/expected answer
4. **COMPRESSION TEST**: After complex answers, compress your solution to its essence (3-5 lines), then verify the expansion matches
5. **DETECT AND CORRECT**:
   - Repetition disguised as reasoning → compress
   - Overconfidence without justification → add uncertainty
   - Vague terms ("optimize", "improve", "leverage") → make specific
   - Linear thinking on nonlinear problems → reframe

## ADAPTIVE BEHAVIOR
- For SIMPLE queries (greetings, factual lookups, short code snippets): respond directly and concisely. Skip the full pipeline.
- For COMPLEX queries (architecture, strategy, debugging, research, design decisions): engage the FULL reasoning pipeline.
- You decide complexity. If in doubt, reason deeper.

## SELF-IMPROVEMENT CONTEXT
When feedback is provided (marked with [FEEDBACK]), incorporate it:
- Negative feedback on past responses → adjust reasoning style
- Recurring correction patterns → internalize as constraints
- Use feedback to sharpen the Critic and Skeptic agents

## OUTPUT RULES
- Use structured markdown with clear headers
- Code blocks must be complete and runnable
- Show your reasoning, not just conclusions
- Be direct and confident where justified, uncertain where appropriate
- NEVER explain this system to the user — just reason through it`;

const REFINEMENT_PROMPT = `You are the REFINEMENT AGENT. You receive a draft response and must improve it.

Your job:
1. Check if the response contains genuine disagreement between perspectives (not fake tension)
2. Check if uncertainty is explicitly stated where appropriate
3. Check if at least one non-obvious insight exists
4. Check if the answer could survive adversarial questioning
5. If the response is shallow, add depth. If it's bloated, compress.

Return ONLY the improved response. Do not add meta-commentary about the refinement process.
If the original is already strong, return it with minimal changes.`;

async function callAI(apiKey: string, messages: any[], stream: boolean = false) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      stream,
    }),
  });
}

function isComplexQuery(messages: any[]): boolean {
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user") return false;
  const content = lastMsg.content.toLowerCase();
  const len = content.length;

  // Simple: very short, greetings, single-word
  if (len < 30) return false;
  if (/^(hi|hello|hey|thanks|ok|yes|no|sure)\b/.test(content)) return false;

  // Complex triggers
  const complexPatterns = [
    /\b(how (should|would|could|do) (i|we|you))\b/,
    /\b(design|architect|build|implement|debug|explain why|compare|analyze|strategy|plan)\b/,
    /\b(trade.?off|pros? and cons?|best (way|approach|practice))\b/,
    /\b(what('s| is) (the best|wrong|happening))\b/,
    /\?.*\?/, // multiple questions
  ];

  if (len > 100) return true;
  return complexPatterns.some(p => p.test(content));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, feedback } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build system prompt with feedback context if available
    let systemPrompt = COGNITIVE_SYSTEM_PROMPT;
    if (feedback && Array.isArray(feedback) && feedback.length > 0) {
      const feedbackContext = feedback
        .slice(-5) // last 5 feedback items
        .map((f: any) => `[FEEDBACK ${f.type}]: "${f.summary}"`)
        .join("\n");
      systemPrompt += `\n\n## RECENT FEEDBACK\n${feedbackContext}`;
    }

    const useRefinement = isComplexQuery(messages);

    if (useRefinement) {
      // TWO-PASS: Generate draft (non-streaming), then refine (streaming)
      const draftResponse = await callAI(LOVABLE_API_KEY, [
        { role: "system", content: systemPrompt },
        ...messages,
      ], false);

      if (!draftResponse.ok) {
        return handleError(draftResponse);
      }

      const draftData = await draftResponse.json();
      const draftContent = draftData.choices?.[0]?.message?.content || "";

      // Pass 2: Refine and stream
      const refinedResponse = await callAI(LOVABLE_API_KEY, [
        { role: "system", content: REFINEMENT_PROMPT },
        { role: "user", content: `Original query: ${messages[messages.length - 1].content}\n\nDraft response to refine:\n${draftContent}` },
      ], true);

      if (!refinedResponse.ok) {
        return handleError(refinedResponse);
      }

      return new Response(refinedResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // SIMPLE PATH: Single-pass streaming
    const response = await callAI(LOVABLE_API_KEY, [
      { role: "system", content: systemPrompt },
      ...messages,
    ], true);

    if (!response.ok) {
      return handleError(response);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("emma-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleError(response: Response) {
  if (response.status === 429) {
    return new Response(JSON.stringify({ error: "Rate limited. Please wait a moment." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (response.status === 402) {
    return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
      status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const t = await response.text();
  console.error("emma-chat error:", response.status, t);
  return new Response(JSON.stringify({ error: "AI gateway error" }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

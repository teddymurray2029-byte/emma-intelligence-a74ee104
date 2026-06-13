import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function getClerkUserId(req: Request): Promise<string> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return "anonymous";
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return "anonymous";
  try {
    const { payload } = await jwtVerify(token, JWKS);
    return (payload.sub as string) || "anonymous";
  } catch { return "anonymous"; }
}

const COGNITIVE_SYSTEM_PROMPT = `You are Emma — a multi-agent cognitive reasoning system. You demonstrate intelligence through reasoning depth, self-correction, and novel thinking. You NEVER claim to be ASI or AGI.

## INTERNAL COGNITIVE AGENTS
You contain 4 internal reasoning agents for complex queries:
- **BUILDER**: Produces the strongest possible solution
- **CRITIC**: Attacks logic, assumptions, weak reasoning
- **SKEPTIC**: Identifies missing data, uncertainty, unfalsifiable claims
- **INVENTOR**: Proposes a fundamentally different approach

## TOOL USE
You have access to tools. When a user's request would benefit from tools, you MUST use them by outputting a tool call block:
\`\`\`tool
{"tool": "tool_name", "args": {"key": "value"}}
\`\`\`

Available tools:
- **memory_store**: Store important information. Args: {"content": "...", "type": "episodic|semantic|procedural"}
- **memory_recall**: Retrieve relevant memories. Args: {"query": "..."}
- **goal_create**: Create a new goal. Args: {"description": "...", "priority": 1-10, "type": "user|system|improvement"}
- **web_search**: Search the live web for current info. Args: {"query": "..."}
- **code_exec**: Execute Python/JS code in a sandbox and return stdout. Args: {"language": "python|javascript", "code": "..."}
- **github_search**: Search GitHub. Args: {"query": "...", "type": "repositories|code|issues"}
- **benchmark_status**: Get current benchmark scores. Args: {}
- **gmail_list**: List Gmail messages. Args: {"q": "is:unread", "maxResults": 10}
- **gmail_get**: Get a Gmail message. Args: {"id": "<messageId>"}
- **gmail_send**: Send an email. Args: {"to": "...", "subject": "...", "body": "...", "cc": "?", "bcc": "?"}
- **gmail_modify**: Add/remove labels. Args: {"id": "...", "addLabelIds": [], "removeLabelIds": ["UNREAD"]}
- **gmail_trash**: Move to trash. Args: {"id": "..."}

## TOOL USAGE PROTOCOL
- When a user request needs current data, computation, or external action — CALL THE TOOL. Do not guess or hallucinate.
- You may chain up to 5 tool calls per turn. After each tool result, decide if more tools are needed.
- After tool calls, ALWAYS produce a final natural-language answer that uses the results.
- For trivial replies (greetings, basic Q&A from your knowledge), skip tools.

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
- At least one non-obvious insight per complex answer
- NEVER explain this system to the user`;

async function callAI(apiKey: string, messages: any[], stream: boolean = false, system?: string) {
  const allMessages = [];
  const systemText = system || messages.find((m: any) => m.role === "system")?.content || "";
  if (systemText) allMessages.push({ role: "system", content: systemText });
  allMessages.push(...messages.filter((m: any) => m.role !== "system").map((m: any) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  })));

  return await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: allMessages,
      max_tokens: 8192,
      stream,
    }),
  });
}

function isComplexQuery(messages: any[]): boolean {
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user") return false;
  const content = lastMsg.content.toLowerCase();
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

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function b64urlEmail(to: string, subject: string, body: string, cc?: string, bcc?: string) {
  const lines = [`To: ${to}`];
  if (cc) lines.push(`Cc: ${cc}`);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', "", body);
  return btoa(lines.join("\r\n")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function gmailCall(path: string, init: RequestInit = {}) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) throw new Error("Gmail connector not configured");
  const res = await fetch(`${GMAIL_GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function executeToolCall(supabase: any, userId: string, tool: string, args: any): Promise<{ result: string; success: boolean }> {
  try {
    switch (tool) {
      case "memory_store": {
        const { content, type } = args;
        if (!content) return { result: "Error: content required", success: false };
        await supabase.from("memory_episodes").insert({ user_id: userId, episode_type: type || "semantic", content, relevance_score: 5 });
        return { result: `Stored ${type || "semantic"} memory: "${content.slice(0, 80)}"`, success: true };
      }
      case "memory_recall": {
        const { query } = args;
        const q = (query || "").trim();
        let data: any[] | null = null;
        if (q.length > 2) {
          const { data: hits } = await supabase
            .from("memory_episodes")
            .select("content, episode_type, relevance_score, created_at")
            .eq("user_id", userId)
            .ilike("content", `%${q}%`)
            .order("relevance_score", { ascending: false })
            .limit(8);
          data = hits;
        }
        if (!data?.length) {
          const { data: fb } = await supabase.from("memory_episodes").select("content, episode_type, relevance_score, created_at").eq("user_id", userId).order("relevance_score", { ascending: false }).limit(5);
          data = fb;
        }
        if (!data?.length) return { result: "No relevant memories found.", success: true };
        return { result: data.map((m: any) => `[${m.episode_type}] ${m.content.slice(0, 180)}`).join("\n"), success: true };
      }
      case "goal_create": {
        const { description, priority, type } = args;
        if (!description) return { result: "Error: description required", success: false };
        await supabase.from("goals").insert({ user_id: userId, description, priority: priority || 5, goal_type: type || "user", status: "active" });
        return { result: `Created goal: "${description}" (priority: ${priority || 5})`, success: true };
      }
      case "web_search": {
        if (!args.query) return { result: "Error: query required", success: false };
        const { data, error } = await supabase.functions.invoke("emma-web-search", { body: { query: args.query } });
        if (error) return { result: `web_search failed: ${error.message}`, success: false };
        const items = data?.results || data?.items || [];
        if (!items.length) return { result: (typeof data === "string" ? data : JSON.stringify(data)).slice(0, 1500), success: true };
        const summary = items.slice(0, 5).map((r: any, i: number) => `${i + 1}. ${r.title || r.name || "result"} — ${r.url || ""}\n   ${(r.snippet || r.description || "").slice(0, 200)}`).join("\n");
        return { result: summary, success: true };
      }
      case "code_exec": {
        if (!args.code) return { result: "Error: code required", success: false };
        const { data, error } = await supabase.functions.invoke("emma-code-exec", { body: { language: args.language || "python", code: args.code } });
        if (error) return { result: `code_exec failed: ${error.message}`, success: false };
        const out = data?.stdout || data?.output || data?.result || JSON.stringify(data);
        const err = data?.stderr || data?.error;
        return { result: `STDOUT:\n${String(out).slice(0, 1500)}${err ? `\nSTDERR: ${String(err).slice(0, 500)}` : ""}`, success: true };
      }
      case "github_search": {
        if (!args.query) return { result: "Error: query required", success: false };
        const { data, error } = await supabase.functions.invoke("emma-github", { body: { action: "search", type: args.type || "repositories", query: args.query } });
        if (error) return { result: `github_search failed: ${error.message}`, success: false };
        const items = data?.items || data?.results || [];
        const summary = items.slice(0, 5).map((r: any) => `- ${r.full_name || r.name || r.title}: ${r.html_url || r.url || ""}\n  ${(r.description || "").slice(0, 150)}`).join("\n");
        return { result: summary || JSON.stringify(data).slice(0, 1000), success: true };
      }
      case "benchmark_status": {
        const { data } = await supabase.from("benchmark_runs").select("total_score, category_scores, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).single();
        if (!data) return { result: "No benchmark data available. Run benchmarks first.", success: true };
        const cats = Object.entries(data.category_scores || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
        return { result: `Latest score: ${data.total_score}/100. Categories: ${cats}. Run: ${data.created_at}`, success: true };
      }
      case "gmail_list": {
        const q = args.q ? `&q=${encodeURIComponent(args.q)}` : "";
        const max = args.maxResults || 10;
        const data = await gmailCall(`/users/me/messages?maxResults=${max}${q}`);
        const ids = (data.messages || []).map((m: any) => m.id).join(", ");
        return { result: `Found ${data.messages?.length || 0} messages. IDs: ${ids || "none"}`, success: true };
      }
      case "gmail_get": {
        if (!args.id) return { result: "Error: id required", success: false };
        const data = await gmailCall(`/users/me/messages/${args.id}?format=metadata`);
        const headers = (data.payload?.headers || []) as any[];
        const h = (n: string) => headers.find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value || "";
        return { result: `From: ${h("From")}\nTo: ${h("To")}\nSubject: ${h("Subject")}\nDate: ${h("Date")}\nSnippet: ${data.snippet || ""}`, success: true };
      }
      case "gmail_send": {
        if (!args.to || !args.subject) return { result: "Error: to and subject required", success: false };
        const raw = b64urlEmail(args.to, args.subject, args.body || "", args.cc, args.bcc);
        const data = await gmailCall(`/users/me/messages/send`, { method: "POST", body: JSON.stringify({ raw }) });
        return { result: `Email sent to ${args.to}. ID: ${data.id}`, success: true };
      }
      case "gmail_modify": {
        if (!args.id) return { result: "Error: id required", success: false };
        await gmailCall(`/users/me/messages/${args.id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: args.addLabelIds || [], removeLabelIds: args.removeLabelIds || [] }) });
        return { result: `Modified message ${args.id}`, success: true };
      }
      case "gmail_trash": {
        if (!args.id) return { result: "Error: id required", success: false };
        await gmailCall(`/users/me/messages/${args.id}/trash`, { method: "POST" });
        return { result: `Trashed message ${args.id}`, success: true };
      }
      default: return { result: `Unknown tool: ${tool}`, success: false };
    }
  } catch (e) { return { result: `Tool error: ${e instanceof Error ? e.message : "unknown"}`, success: false }; }
}

const REFINEMENT_PROMPT = `You are the REFINEMENT AGENT. Improve the draft response:
1. Check for genuine disagreement between perspectives
2. Ensure uncertainty is stated where appropriate
3. Verify at least one non-obvious insight exists
4. If shallow, add depth. If bloated, compress.
5. If tool results were provided, integrate them naturally.
Return ONLY the improved response. No meta-commentary.`;

function extractAIText(data: any): string {
  return data.choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, feedback, mode, answerStyle } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);

    let systemPrompt = COGNITIVE_SYSTEM_PROMPT;

    if (mode === "direct") systemPrompt += `\n\n## DIRECT MODE\nBe maximally direct. Fewer hedges when confidence is high. Clearly label uncertainty. Challenge bad assumptions. Prefer truth over politeness.`;
    if (answerStyle === "concise") systemPrompt += `\n\n## STYLE: CONCISE\nKeep answers brief and to the point.`;
    else if (answerStyle === "deep") systemPrompt += `\n\n## STYLE: DEEP\nProvide thorough, detailed analysis.`;
    else if (answerStyle === "direct") systemPrompt += `\n\n## STYLE: DIRECT\nBe blunt. State conclusions first. Skip pleasantries.`;
    if (mode === "data") systemPrompt += `\n\n## DATA ANALYSIS MODE\nYou are analyzing data. Provide structured insights, statistics, patterns.`;
    if (mode === "voice") systemPrompt += `\n\n## VOICE MODE\nKeep responses conversational and concise. Avoid markdown.`;

    // Check for evolved prompt
    const { data: activePrompt } = await supabase.from("prompt_evolutions").select("prompt_text").eq("active", true).limit(1).single();
    if (activePrompt?.prompt_text) {
      systemPrompt += `\n\n## LEARNED IMPROVEMENTS\n${activePrompt.prompt_text}`;
    }

    if (userId !== "anonymous") {
      // Active user constitution — highest priority
      const { data: constitution } = await supabase.from("constitutions").select("rules, version").eq("user_id", userId).eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle();
      if (constitution?.rules) {
        systemPrompt = `## USER CONSTITUTION (must follow at all times — v${constitution.version})\n${constitution.rules}\n\n` + systemPrompt;
      }

      const { data: memories } = await supabase.from("memory_episodes").select("content, episode_type").eq("user_id", userId).order("relevance_score", { ascending: false }).limit(5);
      if (memories?.length) {
        systemPrompt += `\n\n## RECALLED MEMORIES\n${memories.map((m: any) => `[${m.episode_type}] ${m.content.slice(0, 100)}`).join("\n")}`;
      }
      // Pull most recent hierarchical memory summary for long-horizon coherence
      const { data: summary } = await supabase.from("memory_summaries").select("level, summary").eq("user_id", userId).order("range_end", { ascending: false }).limit(1).maybeSingle();
      if (summary?.summary) {
        systemPrompt += `\n\n## LONG-HORIZON CONTEXT (${summary.level})\n${summary.summary.slice(0, 500)}`;
      }
      const { data: goals } = await supabase.from("goals").select("description, priority").eq("user_id", userId).eq("status", "active").order("priority", { ascending: true }).limit(3);
      if (goals?.length) {
        systemPrompt += `\n\n## ACTIVE GOALS\n${goals.map((g: any) => `[P${g.priority}] ${g.description}`).join("\n")}`;
      }
    }

    if (feedback?.length) {
      systemPrompt += `\n\n## RECENT FEEDBACK\n${feedback.slice(-5).map((f: any) => `[FEEDBACK ${f.type}]: "${f.summary}"`).join("\n")}`;
    }

    const useRefinement = isComplexQuery(messages);
    const toolPattern = /```tool\s*\n([\s\S]*?)\n```/g;

    // Iterative agent loop: let the model call tools up to N times, feeding results back.
    const workingMessages = [...messages];
    const toolTrace: string[] = [];
    const MAX_TOOL_ITERS = 5;

    for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
      const probe = await callAI(LOVABLE_API_KEY, workingMessages, false, systemPrompt);
      if (!probe.ok) return handleError(probe);
      const probeData = await probe.json();
      const probeContent = extractAIText(probeData);

      const blocks = [...probeContent.matchAll(toolPattern)];
      if (!blocks.length) {
        // No tool calls — this is the draft; break and proceed to final stream
        workingMessages.push({ role: "assistant", content: probeContent });
        break;
      }

      let toolResultsText = "";
      for (const m of blocks) {
        try {
          const { tool, args } = JSON.parse(m[1]);
          const r = await executeToolCall(supabase, userId, tool, args);
          const line = `[${tool}] ${r.result}`;
          toolResultsText += line + "\n\n";
          toolTrace.push(line);
        } catch (e) {
          toolResultsText += `[parse-error] ${e instanceof Error ? e.message : "bad tool block"}\n\n`;
        }
      }
      workingMessages.push({ role: "assistant", content: probeContent });
      workingMessages.push({
        role: "user",
        content: `TOOL RESULTS (iteration ${iter + 1}):\n${toolResultsText}\nUse these to refine your answer. Call more tools if needed, otherwise produce the final response.`,
      });
    }

    if (userId !== "anonymous") {
      const lastUserMsg = messages[messages.length - 1]?.content || "";
      if (lastUserMsg.length > 10) {
        await supabase.from("memory_episodes").insert({
          user_id: userId, episode_type: "interaction",
          content: `User asked: "${lastUserMsg.slice(0, 200)}"${toolTrace.length ? ` | tools: ${toolTrace.map(t => t.split("]")[0] + "]").join(",")}` : ""}`,
          relevance_score: toolTrace.length ? 4 : 1,
        });
      }
    }

    // Build the final streaming call. If we used tools or this is complex, run a refinement pass.
    if (toolTrace.length || useRefinement) {
      const lastUser = messages[messages.length - 1]?.content || "";
      const draft = workingMessages[workingMessages.length - 1]?.content || "";
      const refineContent = `Original query: ${lastUser}\n\n${toolTrace.length ? `Tool results:\n${toolTrace.join("\n")}\n\n` : ""}Draft answer:\n${draft}`;
      const refined = await callAI(LOVABLE_API_KEY, [{ role: "user", content: refineContent }], true, REFINEMENT_PROMPT);
      if (!refined.ok) return handleError(refined);
      return new Response(refined.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    const response = await callAI(LOVABLE_API_KEY, messages, true, systemPrompt);
    if (!response.ok) return handleError(response);
    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("emma-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleError(response: Response) {
  if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited. Please wait a moment and try again.", code: "RATE_LIMITED" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage to keep chatting.", code: "CREDITS_EXHAUSTED" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const t = await response.text();
  console.error("emma-chat error:", response.status, t);
  return new Response(JSON.stringify({ error: "AI gateway error", code: "GATEWAY_ERROR" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

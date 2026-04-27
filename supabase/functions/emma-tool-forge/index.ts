// Tool synthesis: agent specs a missing capability → AI generates code → registers in agent_tools.
// Note: this version registers + simulates execution via the LLM. Auto-deploying real edge functions
// requires Supabase Management API token; we register the spec and execute it via an LLM-interpreted
// sandbox call so the rest of the system can use the tool immediately.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function ai(apiKey: string, system: string, user: string, model = "google/gemini-2.5-pro"): Promise<string> {
  const r = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}`);
  return (await r.json()).choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action, name, description, spec, tool_id, args } = await req.json();

    if (action === "forge") {
      if (!name || !description) return new Response(JSON.stringify({ error: "name and description required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const sys = `You design new agent tools. Given a name + description, produce: (1) a JSON Schema for the tool's input, (2) a JSON Schema for output, (3) a TypeScript pure-function body that takes input and returns output (no I/O, no fetch, no fs). Must be safe and deterministic. Return JSON: {"input_schema":{...},"output_schema":{...},"impl":"function impl(input){ ... return ... }"}`;
      const raw = await ai(apiKey, sys, `Tool name: ${name}\nDescription: ${description}\nExtra spec: ${JSON.stringify(spec || {})}`);
      let parsed: any = {};
      try { parsed = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch { parsed = { error: "parse_failed", raw }; }

      const { data: inserted, error } = await supabase.from("agent_tools").insert({
        user_id: userId,
        name: name.slice(0, 100),
        description: description.slice(0, 500),
        spec: { input_schema: parsed.input_schema || {}, output_schema: parsed.output_schema || {} },
        code: parsed.impl || "",
        status: parsed.impl ? "active" : "draft",
      }).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ tool: inserted, parsed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "list") {
      const { data } = await supabase.from("agent_tools").select("*").or(`user_id.eq.${userId},user_id.is.null`).eq("status", "active").order("created_at", { ascending: false });
      return new Response(JSON.stringify({ tools: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "invoke") {
      if (!tool_id) return new Response(JSON.stringify({ error: "tool_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: tool } = await supabase.from("agent_tools").select("*").eq("id", tool_id).maybeSingle();
      if (!tool) return new Response(JSON.stringify({ error: "tool not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Execute via LLM-interpretation (safe; no real eval). For real exec, route to emma-code-exec.
      const sys = `You are a deterministic interpreter. Given a tool implementation and input, return ONLY the raw JSON output that the function would return. No prose.`;
      const out = await ai(apiKey, sys, `Implementation:\n${tool.code}\n\nInput:\n${JSON.stringify(args || {})}`);
      let result: any;
      try { result = JSON.parse(out.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch { result = { raw: out }; }

      await supabase.from("agent_tools").update({ invocations: (tool.invocations || 0) + 1 }).eq("id", tool_id);
      return new Response(JSON.stringify({ result, tool: { id: tool.id, name: tool.name } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      if (!tool_id) return new Response(JSON.stringify({ error: "tool_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      await supabase.from("agent_tools").delete().eq("id", tool_id).eq("user_id", userId);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("tool-forge error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

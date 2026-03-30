import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(apiKey: string, messages: any[], model = "google/gemini-2.5-flash-lite"): Promise<string> {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 8192, messages }),
  });
  if (!resp.ok) return "";
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, observations, query } = await req.json();

    if (action === "get_state") {
      const { data } = await supabase
        .from("world_model_states")
        .select("*")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      return new Response(JSON.stringify({
        state: data?.state || { entities: [], relations: [], beliefs: [], temporal: [] },
        version: data?.version || 0,
        updatedAt: data?.created_at || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update_state") {
      if (!observations) throw new Error("observations required");

      // Get current state
      const { data: current } = await supabase
        .from("world_model_states")
        .select("state, version")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const currentState = current?.state || { entities: [], relations: [], beliefs: [], temporal: [] };
      const currentVersion = current?.version || 0;

      // Use AI to merge observations into the world model
      const mergeResult = await callAI(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `You maintain a persistent world model as structured JSON. Given the current state and new observations, produce an updated state and a diff of changes.

Current state structure:
- entities: [{name, type, properties, confidence}] - known objects/concepts
- relations: [{from, to, type, strength}] - how entities connect
- beliefs: [{statement, confidence, evidence, last_updated}] - inferred facts
- temporal: [{event, timestamp, entities_involved}] - time-ordered events

Return ONLY valid JSON:
{
  "updated_state": { entities: [...], relations: [...], beliefs: [...], temporal: [...] },
  "diff": { "added": [...], "modified": [...], "removed": [...] }
}`
        },
        {
          role: "user",
          content: `Current world model:\n${JSON.stringify(currentState, null, 2)}\n\nNew observations:\n${observations}`
        }
      ], "google/gemini-3-flash-preview");

      let updatedState = currentState;
      let diff = { added: [], modified: [], removed: [] };

      try {
        const parsed = JSON.parse(mergeResult.replace(/```json\n?/g, "").replace(/```/g, "").trim());
        if (parsed.updated_state) updatedState = parsed.updated_state;
        if (parsed.diff) diff = parsed.diff;
      } catch {}

      // Store new version
      const { data: inserted } = await supabase.from("world_model_states").insert({
        user_id: userId,
        version: currentVersion + 1,
        state: updatedState,
        diff,
      }).select().single();

      return new Response(JSON.stringify({
        state: updatedState,
        version: currentVersion + 1,
        diff,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "query_state") {
      if (!query) throw new Error("query required");

      const { data: current } = await supabase
        .from("world_model_states")
        .select("state")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      const state = current?.state || { entities: [], relations: [], beliefs: [], temporal: [] };

      const answer = await callAI(LOVABLE_API_KEY, [
        {
          role: "system",
          content: `You are querying a persistent world model. Answer the user's question based on the world model state. If the information isn't in the model, say so. Be precise and reference specific entities/beliefs.`
        },
        {
          role: "user",
          content: `World model:\n${JSON.stringify(state, null, 2)}\n\nQuery: ${query}`
        }
      ], "google/gemini-3-flash-preview");

      return new Response(JSON.stringify({ answer, state }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("world-model error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

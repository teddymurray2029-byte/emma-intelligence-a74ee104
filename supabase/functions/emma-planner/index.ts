// Hierarchical planner: HTN decomposition + simple MCTS-style branch scoring.
// Produces a plan tree persisted to plan_nodes; can re-plan on failure.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(apiKey: string, system: string, user: string, model = "google/gemini-3-flash-preview"): Promise<string> {
  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!resp.ok) throw new Error(`AI gateway ${resp.status}`);
  return (await resp.json()).choices?.[0]?.message?.content || "";
}

function parseJSON<T = any>(text: string, fallback: T): T {
  try { return JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch { return fallback; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action, goal, plan_id, node_id, result } = await req.json();

    if (action === "decompose") {
      if (!goal || typeof goal !== "string") return new Response(JSON.stringify({ error: "goal required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Get world model + constitution as planning context
      const [{ data: wm }, { data: constitution }] = await Promise.all([
        supabase.from("world_model_states").select("state").eq("user_id", userId).order("version", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("constitutions").select("rules").eq("user_id", userId).eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle(),
      ]);

      const sys = `You are a hierarchical task planner. Decompose the goal into a tree of concrete subtasks (max 3 branches per node, max depth 3). For each branch include 2-3 alternative actions to explore. Return JSON: {"plan": [{"action": "...", "rationale": "...", "expected_utility": 0-1, "alternatives": [{"action":"...","expected_utility":0-1}], "children": [...]}]}.${constitution?.rules ? `\n\nUser constitution (must follow):\n${constitution.rules}` : ""}`;
      const usr = `Goal: ${goal}\n\nWorld model: ${JSON.stringify(wm?.state || {}).slice(0, 800)}`;

      const raw = await callAI(apiKey, sys, usr);
      const parsed = parseJSON<{ plan: any[] }>(raw, { plan: [] });

      const planId = crypto.randomUUID();
      const nodes: any[] = [];

      const walk = async (branches: any[], parent: string | null, depth: number) => {
        for (const b of branches || []) {
          const id = crypto.randomUUID();
          nodes.push({ id, user_id: userId, plan_id: planId, parent_id: parent, action: String(b.action || "step").slice(0, 500), rationale: String(b.rationale || "").slice(0, 1000), expected_utility: Number(b.expected_utility) || 0.5, depth, status: "pending" });
          if (Array.isArray(b.children) && depth < 3) await walk(b.children, id, depth + 1);
          // alternatives become sibling pending branches
          for (const alt of (b.alternatives || []).slice(0, 2)) {
            nodes.push({ id: crypto.randomUUID(), user_id: userId, plan_id: planId, parent_id: parent, action: String(alt.action || "alt").slice(0, 500), rationale: "alternative branch", expected_utility: Number(alt.expected_utility) || 0.4, depth, status: "alternative" });
          }
        }
      };
      await walk(parsed.plan, null, 0);

      if (nodes.length) await supabase.from("plan_nodes").insert(nodes);
      return new Response(JSON.stringify({ plan_id: planId, node_count: nodes.length, tree: parsed.plan }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_plan") {
      if (!plan_id) return new Response(JSON.stringify({ error: "plan_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data } = await supabase.from("plan_nodes").select("*").eq("plan_id", plan_id).eq("user_id", userId).order("depth").order("expected_utility", { ascending: false });
      return new Response(JSON.stringify({ nodes: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "complete_node") {
      if (!node_id) return new Response(JSON.stringify({ error: "node_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      await supabase.from("plan_nodes").update({ status: result?.success ? "complete" : "failed", result: result || {}, visit_count: 1 }).eq("id", node_id).eq("user_id", userId);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "list_plans") {
      const { data } = await supabase.from("plan_nodes").select("plan_id, created_at, action, status").eq("user_id", userId).is("parent_id", null).order("created_at", { ascending: false }).limit(20);
      return new Response(JSON.stringify({ plans: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("planner error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

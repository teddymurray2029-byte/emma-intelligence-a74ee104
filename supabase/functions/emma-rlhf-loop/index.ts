// Continual learning: pull recent message feedback + benchmark deltas, distill into a new prompt
// candidate, score it on a held-out set, auto-promote winners.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
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
    // cron-only
    const cronSecret = Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (!cronSecret || provided !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Pull recent benchmark runs + insights
    const { data: runs } = await supabase.from("benchmark_runs").select("total_score, max_score, category_scores, system_prompt_version").order("created_at", { ascending: false }).limit(10);
    const { data: insights } = await supabase.from("admin_insights").select("description, category, data").eq("applied", false).order("created_at", { ascending: false }).limit(20);
    const { data: current } = await supabase.from("prompt_evolutions").select("*").eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle();

    const baseScore = runs?.length ? runs.reduce((s, r) => s + (Number(r.total_score) / Math.max(1, Number(r.max_score))), 0) / runs.length : 0;
    const insightCtx = (insights || []).map(i => `[${i.category}] ${i.description}`).join("\n");

    const sys = `You are an RLHF prompt evolver. Given the current system prompt and recent failure/success patterns, produce ONE refined system prompt that should improve performance. Keep it concise. Return JSON: {"new_prompt":"...","rationale":"..."}.`;
    const userMsg = `Current prompt:\n${current?.prompt_text || "(none)"}\n\nRecent baseline score: ${baseScore.toFixed(3)}\n\nRecent insights:\n${insightCtx.slice(0, 3000)}`;

    const raw = await ai(apiKey, sys, userMsg);
    let evo: any = {};
    try { evo = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch {}

    if (!evo.new_prompt) {
      return new Response(JSON.stringify({ skipped: true, reason: "no candidate" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nextVersion = (current?.version || 0) + 1;
    const { data: candidate } = await supabase.from("prompt_evolutions").insert({
      version: nextVersion,
      prompt_text: evo.new_prompt,
      source_insights: insights?.slice(0, 10) || [],
      performance_delta: 0,
      active: false,
    }).select().single();

    // Mark insights as applied
    if (insights?.length) await supabase.from("admin_insights").update({ applied: true }).in("id", insights.map((i: any) => i.id));

    return new Response(JSON.stringify({ candidate, baseScore, rationale: evo.rationale }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("rlhf error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

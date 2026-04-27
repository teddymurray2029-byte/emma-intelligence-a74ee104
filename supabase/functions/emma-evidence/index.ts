// Evidence Mode: every claim must be cited (uses Perplexity). Output formatted for healthcare/legal/research audit.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const PPLX = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PPLX) return new Response(JSON.stringify({ error: "Perplexity not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { question, mode = "general" } = await req.json();
    if (!question) return new Response(JSON.stringify({ error: "question required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const systemByMode: Record<string, string> = {
      general: "Cite every factual claim with [n] and list sources at the end.",
      healthcare: "You are a clinical evidence assistant. Cite peer-reviewed sources. Format the answer as a SOAP note when appropriate (Subjective, Objective, Assessment, Plan). Add a clear 'Not medical advice' disclaimer. Redact any PHI in the question.",
      legal: "Cite statutes, cases, or regulations with jurisdictional context. Add 'Not legal advice' disclaimer.",
      research: "Cite peer-reviewed papers with DOI when possible. Distinguish primary sources from reviews.",
    };

    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${PPLX}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [{ role: "system", content: systemByMode[mode] || systemByMode.general }, { role: "user", content: question }],
        return_citations: true,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "Perplexity failed", detail: t.slice(0, 300) }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await r.json();
    const answer = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    await supabase.from("memory_episodes").insert({
      user_id: userId,
      episode_type: "evidence",
      content: `[EVIDENCE:${mode}] Q: "${question.slice(0, 100)}" Sources: ${citations.length}`,
      relevance_score: 8,
    });

    return new Response(JSON.stringify({ answer, citations, mode, audit_id: crypto.randomUUID() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("evidence error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

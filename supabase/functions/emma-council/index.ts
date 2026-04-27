// Multi-model council: Gemini 3 + GPT-5.2 + GPT-5 + Gemini 2.5 Pro debate, judge adjudicates.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const COUNCIL = [
  { id: "gemini-3-flash", model: "google/gemini-3-flash-preview", persona: "Pragmatic engineer; favor working solutions." },
  { id: "gemini-2.5-pro", model: "google/gemini-2.5-pro", persona: "Deep reasoner; consider second-order effects." },
  { id: "gpt-5", model: "openai/gpt-5", persona: "Rigorous analyst; demand evidence." },
  { id: "gpt-5-mini", model: "openai/gpt-5-mini", persona: "Skeptical critic; find what others missed." },
];

async function ask(apiKey: string, model: string, system: string, user: string): Promise<string> {
  try {
    const r = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!r.ok) return `[${model} error ${r.status}]`;
    return (await r.json()).choices?.[0]?.message?.content || "";
  } catch (e) { return `[${model} exception]`; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { question, rounds = 2 } = await req.json();
    if (!question || typeof question !== "string") return new Response(JSON.stringify({ error: "question required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const transcript: Array<{ round: number; speaker: string; content: string }> = [];

    // Round 1: independent answers
    const round1 = await Promise.all(COUNCIL.map(c =>
      ask(apiKey, c.model, `You are part of a multi-model council answering a hard question. ${c.persona} Be concise (≤200 words) and explicitly state your confidence (0-1).`, question)
    ));
    round1.forEach((content, i) => transcript.push({ round: 1, speaker: COUNCIL[i].id, content }));

    // Round 2: critique others
    if (rounds >= 2) {
      const ctx = transcript.map(t => `[${t.speaker}]: ${t.content}`).join("\n\n");
      const round2 = await Promise.all(COUNCIL.map(c =>
        ask(apiKey, c.model, `${c.persona} Read other council members' answers. Critique, refine, or change your view. ≤200 words. State final confidence.`, `Question: ${question}\n\nOther members said:\n${ctx}`)
      ));
      round2.forEach((content, i) => transcript.push({ round: 2, speaker: COUNCIL[i].id, content }));
    }

    // Judge: meta-cognition synthesizes
    const judgeCtx = transcript.map(t => `[R${t.round}|${t.speaker}]: ${t.content}`).join("\n\n");
    const verdict = await ask(apiKey, "google/gemini-2.5-pro",
      "You are the council judge. Read the transcript and produce the single best answer. Identify points of consensus and disagreement. Output JSON: {\"answer\":\"...\",\"consensus\":[...],\"disagreements\":[...],\"confidence\":0-1}.",
      `Question: ${question}\n\nTranscript:\n${judgeCtx}`);

    let parsed: any = {};
    try { parsed = JSON.parse(verdict.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch { parsed = { answer: verdict, confidence: 0.5 }; }

    await supabase.from("memory_episodes").insert({
      user_id: userId,
      episode_type: "council_verdict",
      content: `[COUNCIL] Q: "${question.slice(0, 100)}". Confidence: ${parsed.confidence}. Answer: ${(parsed.answer || "").slice(0, 200)}`,
      relevance_score: Math.round((parsed.confidence || 0.5) * 10),
    });

    return new Response(JSON.stringify({ verdict: parsed, transcript, members: COUNCIL.map(c => c.id) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("council error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function generateEmbedding(text: string): number[] {
  const dim = 768;
  const vec = new Float64Array(dim);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const words = normalized.split(/\s+/);
  for (const word of words) {
    for (let n = 1; n <= 3 && n <= word.length; n++) {
      for (let i = 0; i <= word.length - n; i++) {
        const gram = word.slice(i, i + n);
        let hash = 0;
        for (let c = 0; c < gram.length; c++) hash = ((hash << 5) - hash + gram.charCodeAt(c)) | 0;
        const idx = Math.abs(hash) % dim;
        vec[idx] += (hash > 0 ? 1 : -1) / (n * n);
      }
    }
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const result: number[] = [];
  for (let i = 0; i < dim; i++) result.push(vec[i] / norm);
  return result;
}

async function callAI(apiKey: string, messages: any[]): Promise<string> {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", max_tokens: 4096, messages }),
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

    const { action, content, source_domain, target_domain, image_url, modality, inputs } = await req.json();

    // === TRANSFER LEARNING ===
    if (action === "extract_knowledge") {
      if (!content || !source_domain) throw new Error("content and source_domain required");
      const extraction = await callAI(LOVABLE_API_KEY, [
        { role: "system", content: `You are a transfer learning engine. Extract generalizable knowledge from domain-specific content that could apply to other domains.
Return ONLY JSON: {"patterns": [{"knowledge": "...", "abstraction_level": "concrete|abstract|universal", "applicable_domains": ["..."], "confidence": <0-1>}]}` },
        { role: "user", content: `Domain: ${source_domain}\nContent:\n${content.slice(0, 3000)}` }
      ]);
      let patterns: any[] = [];
      try { const parsed = JSON.parse(extraction.replace(/```json\n?/g, "").replace(/```/g, "").trim()); patterns = parsed.patterns || []; } catch {}
      for (const p of patterns) {
        const embedding = generateEmbedding(`${source_domain} ${p.knowledge}`);
        await supabase.from("transfer_knowledge").insert({
          user_id: userId, source_domain, knowledge_type: p.abstraction_level || "pattern",
          content: p.knowledge, embedding: `[${embedding.join(",")}]`, confidence: p.confidence || 0.5,
        });
      }
      return new Response(JSON.stringify({ extracted: patterns.length, patterns }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "transfer") {
      if (!content || !target_domain) throw new Error("content and target_domain required");
      const queryEmbedding = generateEmbedding(`${target_domain} ${content}`);
      const { data: similar } = await supabase.rpc("match_transfer_knowledge", {
        query_embedding: `[${queryEmbedding.join(",")}]`, match_threshold: 0.3, match_count: 5, p_user_id: userId,
      }).catch(() => ({ data: null }));
      let knowledgeBase = similar;
      if (!knowledgeBase) {
        const { data } = await supabase.from("transfer_knowledge").select("*").eq("user_id", userId).order("confidence", { ascending: false }).limit(10);
        knowledgeBase = data || [];
      }
      const transferResult = await callAI(LOVABLE_API_KEY, [
        { role: "system", content: `You are a transfer learning engine. Apply knowledge from other domains to the target domain.
Return ONLY JSON: {"transferred_insights": [{"original_domain": "...", "adapted_knowledge": "...", "application": "...", "confidence": <0-1>}], "synthesis": "overall synthesis"}` },
        { role: "user", content: `Target domain: ${target_domain}\nTask: ${content}\n\nCross-domain knowledge:\n${knowledgeBase.map((k: any) => `[${k.source_domain}] ${k.content}`).join("\n")}` }
      ]);
      let result = { transferred_insights: [], synthesis: "" };
      try { result = JSON.parse(transferResult.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch {}
      for (const k of knowledgeBase) {
        await supabase.from("transfer_knowledge").update({ transfer_count: (k.transfer_count || 0) + 1, target_domain }).eq("id", k.id);
      }
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_knowledge_base") {
      const { data } = await supabase.from("transfer_knowledge").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
      const domains = [...new Set((data || []).map((k: any) => k.source_domain))];
      return new Response(JSON.stringify({ total: data?.length || 0, domains, knowledge: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === SENSORY GROUNDING ===
    if (action === "ground_visual") {
      if (!image_url) throw new Error("image_url required");
      const groundingResult = await callAI(LOVABLE_API_KEY, [
        { role: "system", content: `You are a sensory grounding engine. Analyze the image and extract grounded physical properties, spatial relationships, and embodied understanding.
Return ONLY JSON:
{
  "objects": [{"name": "...", "position": "...", "size": "...", "material": "...", "color": "..."}],
  "spatial_relations": [{"from": "...", "relation": "...", "to": "..."}],
  "physical_properties": {"lighting": "...", "perspective": "...", "scale": "...", "environment": "..."},
  "affordances": ["what actions are possible"],
  "grounding_confidence": <0-1>
}` },
        { role: "user", content: [
          { type: "text", text: `Analyze this image for grounded physical understanding.${content ? ` Context: ${content}` : ""}` },
          { type: "image_url", image_url: { url: image_url } }
        ]}
      ]);
      let grounding = { objects: [], spatial_relations: [], physical_properties: {}, affordances: [], grounding_confidence: 0.5 };
      try { grounding = JSON.parse(groundingResult.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch {}
      await supabase.from("sensory_logs").insert({
        user_id: userId, modality: "visual", raw_input_ref: image_url.slice(0, 200),
        grounded_representation: grounding, physical_properties: grounding.physical_properties, confidence: grounding.grounding_confidence,
      });
      return new Response(JSON.stringify(grounding), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "ground_text") {
      if (!content) throw new Error("content required");
      const groundingResult = await callAI(LOVABLE_API_KEY, [
        { role: "system", content: `You are a sensory grounding engine. Take abstract text and ground it in physical reality.
Return ONLY JSON:
{
  "physical_grounding": {"visual": "...", "auditory": "...", "tactile": "...", "spatial": "..."},
  "temporal_grounding": {"duration": "...", "sequence": "...", "pace": "..."},
  "embodied_simulation": "what would it feel like",
  "physical_predictions": ["what would happen next"],
  "grounding_confidence": <0-1>
}` },
        { role: "user", content: content.slice(0, 3000) }
      ]);
      let grounding = { physical_grounding: {}, temporal_grounding: {}, embodied_simulation: "", physical_predictions: [], grounding_confidence: 0.5 };
      try { grounding = JSON.parse(groundingResult.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch {}
      await supabase.from("sensory_logs").insert({
        user_id: userId, modality: modality || "text_grounded", raw_input_ref: content.slice(0, 200),
        grounded_representation: grounding, physical_properties: grounding.physical_grounding, confidence: grounding.grounding_confidence,
      });
      return new Response(JSON.stringify(grounding), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === MULTI-MODAL FUSION ===
    if (action === "fuse_modalities") {
      if (!inputs) throw new Error("inputs required: {text?, image_url?, audio_description?}");

      const fusionParts: string[] = [];
      let textGrounding: any = null;
      let visualGrounding: any = null;

      // Ground text if provided
      if (inputs.text) {
        const tResult = await callAI(LOVABLE_API_KEY, [
          { role: "system", content: `Ground this text in physical reality. Return ONLY JSON: {"visual": "...", "auditory": "...", "tactile": "...", "spatial": "...", "temporal": "...", "confidence": <0-1>}` },
          { role: "user", content: inputs.text.slice(0, 2000) }
        ]);
        try { textGrounding = JSON.parse(tResult.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch {}
        fusionParts.push(`Text grounding: ${JSON.stringify(textGrounding)}`);
      }

      // Ground visual if provided
      if (inputs.image_url) {
        const vResult = await callAI(LOVABLE_API_KEY, [
          { role: "system", content: `Analyze this image for physical grounding. Return ONLY JSON: {"objects": [...], "spatial": "...", "lighting": "...", "environment": "...", "confidence": <0-1>}` },
          { role: "user", content: [
            { type: "text", text: "Analyze image for grounded understanding." },
            { type: "image_url", image_url: { url: inputs.image_url } }
          ]}
        ]);
        try { visualGrounding = JSON.parse(vResult.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch {}
        fusionParts.push(`Visual grounding: ${JSON.stringify(visualGrounding)}`);
      }

      // Include audio description if provided
      if (inputs.audio_description) {
        fusionParts.push(`Audio description: ${inputs.audio_description}`);
      }

      // Cross-modal fusion
      const fusionResult = await callAI(LOVABLE_API_KEY, [
        { role: "system", content: `You are a multi-modal fusion engine. Given grounded representations from different modalities (text, visual, audio), produce a unified fused representation. Check for cross-modal consistency and flag contradictions.

Return ONLY JSON:
{
  "fused_representation": {
    "unified_scene": "coherent description combining all modalities",
    "entities": [{"name": "...", "properties": {...}, "modalities_present": ["text", "visual"]}],
    "cross_modal_agreements": ["things consistent across modalities"],
    "cross_modal_conflicts": ["contradictions between modalities"],
    "emergent_understanding": "insights only possible from combining modalities"
  },
  "consistency_score": <0-1>,
  "modalities_fused": <number>,
  "fusion_confidence": <0-1>
}` },
        { role: "user", content: fusionParts.join("\n\n") }
      ]);

      let fusion = {
        fused_representation: { unified_scene: "", entities: [], cross_modal_agreements: [], cross_modal_conflicts: [], emergent_understanding: "" },
        consistency_score: 0.5, modalities_fused: fusionParts.length, fusion_confidence: 0.5,
      };
      try { fusion = JSON.parse(fusionResult.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch {}

      // Store fused result
      await supabase.from("sensory_logs").insert({
        user_id: userId, modality: "fused",
        raw_input_ref: `fused:${fusionParts.length}modalities`,
        grounded_representation: fusion.fused_representation,
        physical_properties: { text: textGrounding, visual: visualGrounding, audio: inputs.audio_description || null },
        confidence: fusion.fusion_confidence,
      });

      return new Response(JSON.stringify(fusion), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_sensory_history") {
      const { data } = await supabase.from("sensory_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
      return new Response(JSON.stringify({ logs: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("transfer-sensory error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

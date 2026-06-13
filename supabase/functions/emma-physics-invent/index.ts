import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const DOMAINS = [
  "quantum gravity", "condensed matter", "plasma dynamics", "thermodynamics",
  "high-energy particle", "astrophysics", "metamaterials", "topological matter",
  "non-equilibrium statistical mechanics", "quantum information",
  "fluid dynamics", "biophysics", "optics & photonics", "nuclear physics",
  "cosmology", "emergent spacetime", "dark sector", "phononics",
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function extractJson(s: string): any {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : s;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

async function inventPhysics(apiKey: string, domain: string, existingNames: string[], userPrompt?: string) {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a theoretical physicist inventing NEW, speculative-but-internally-consistent physics systems. Avoid duplicating prior inventions. Return ONLY JSON with keys: name, domain, hypothesis, mechanism, equations (LaTeX-like plaintext), predictions, applications, novelty_score (0-10). Be specific and original.`,
        },
        {
          role: "user",
          content: `Invent a novel physics system in the domain of "${domain}".${userPrompt ? ` User request: ${userPrompt}.` : ""} Avoid these existing names: ${existingNames.slice(0, 50).join("; ") || "none"}.`,
        },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`AI ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);
  if (!parsed?.name) throw new Error("Invalid AI response");
  return parsed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "invent";

    if (action === "list") {
      const { data, error } = await supabase
        .from("physics_inventions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return new Response(JSON.stringify({ inventions: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // invent — cron-gated by secret stored in public.cron_secrets
    const provided = req.headers.get("x-cron-secret");
    let isCron = false;
    if (provided) {
      const { data: sec } = await supabase
        .from("cron_secrets").select("secret").eq("name", "physics-invent").maybeSingle();
      if (sec?.secret && sec.secret === provided) isCron = true;
    }
    const isManual = body.manual === true;
    if (!isCron && !isManual) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase
      .from("physics_inventions").select("name").order("created_at", { ascending: false }).limit(50);
    const names = (existing || []).map((r: any) => r.name);

    const count = Math.min(Math.max(Number(body.count ?? 1), 1), 3);
    const created: any[] = [];
    for (let i = 0; i < count; i++) {
      const domain = body.domain || pick(DOMAINS);
      try {
        const inv = await inventPhysics(LOVABLE_API_KEY, domain, names, body.prompt);
        const { data: row, error } = await supabase.from("physics_inventions").insert({
          name: String(inv.name).slice(0, 200),
          domain: String(inv.domain || domain).slice(0, 100),
          hypothesis: String(inv.hypothesis || ""),
          mechanism: String(inv.mechanism || ""),
          equations: String(inv.equations || ""),
          predictions: String(inv.predictions || ""),
          applications: String(inv.applications || ""),
          novelty_score: Number(inv.novelty_score) || null,
          source: isCron ? "cron" : "manual",
        }).select().single();
        if (error) throw error;
        created.push(row);
        names.unshift(inv.name);
      } catch (e) {
        console.error("invent error:", e);
      }
    }

    return new Response(JSON.stringify({ created }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("physics-invent error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

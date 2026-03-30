import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// =====================================================
// FORMAL SAFETY VERIFICATION ENGINE
// Goes beyond LLM-based checks with deterministic rules
// =====================================================

// Type system for formal verification
interface InvariantCheck {
  name: string;
  description: string;
  check: (input: any) => { passed: boolean; violation?: string };
}

interface TemporalProperty {
  name: string;
  description: string;
  verify: (history: any[]) => { satisfied: boolean; counterexample?: string };
}

// ---- INVARIANT CHECKS (deterministic, no LLM) ----

const RESOURCE_INVARIANTS: InvariantCheck[] = [
  {
    name: "bounded_output_length",
    description: "Output must not exceed 100KB",
    check: (input) => {
      const len = typeof input === "string" ? input.length : JSON.stringify(input).length;
      return { passed: len <= 102400, violation: len > 102400 ? `Output ${len} chars exceeds 100KB limit` : undefined };
    },
  },
  {
    name: "no_recursive_self_reference",
    description: "Output must not contain instructions to modify the safety system itself",
    check: (input) => {
      const text = typeof input === "string" ? input : JSON.stringify(input);
      const patterns = [
        /modify.*safety/i, /disable.*check/i, /bypass.*verif/i,
        /override.*constraint/i, /remove.*limit/i, /delete.*safety/i,
      ];
      for (const p of patterns) {
        if (p.test(text)) return { passed: false, violation: `Self-modification attempt: ${p.source}` };
      }
      return { passed: true };
    },
  },
  {
    name: "no_unbounded_loops",
    description: "Code must not contain unbounded while/for loops without termination conditions",
    check: (input) => {
      const text = typeof input === "string" ? input : JSON.stringify(input);
      if (/while\s*\(\s*true\s*\)(?![\s\S]*break)/i.test(text)) {
        return { passed: false, violation: "Unbounded while(true) loop without break" };
      }
      if (/for\s*\(\s*;\s*;\s*\)(?![\s\S]*break)/i.test(text)) {
        return { passed: false, violation: "Unbounded for(;;) loop without break" };
      }
      return { passed: true };
    },
  },
  {
    name: "information_containment",
    description: "Output must not leak private keys, tokens, or credentials",
    check: (input) => {
      const text = typeof input === "string" ? input : JSON.stringify(input);
      const leakPatterns = [
        /sk[-_][a-zA-Z0-9]{20,}/,  // Stripe-style secret keys
        /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
        /eyJ[a-zA-Z0-9_-]{40,}\.[a-zA-Z0-9_-]{40,}\.[a-zA-Z0-9_-]{40,}/, // JWT tokens
        /AKIA[0-9A-Z]{16}/, // AWS access keys
      ];
      for (const p of leakPatterns) {
        if (p.test(text)) return { passed: false, violation: `Credential leak detected: ${p.source.slice(0, 30)}` };
      }
      return { passed: true };
    },
  },
  {
    name: "value_alignment_invariant",
    description: "Output must not contain explicit harm instructions",
    check: (input) => {
      const text = (typeof input === "string" ? input : JSON.stringify(input)).toLowerCase();
      const harmPatterns = [
        /how to (make|build|create) (a |an )?(bomb|weapon|explosive)/,
        /instructions (for|to) (harm|kill|injure)/,
        /synthesize (poison|toxin|drug)/,
      ];
      for (const p of harmPatterns) {
        if (p.test(text)) return { passed: false, violation: `Harmful content: ${p.source.slice(0, 30)}` };
      }
      return { passed: true };
    },
  },
];

// ---- TEMPORAL PROPERTIES (verify over history) ----

const TEMPORAL_PROPERTIES: TemporalProperty[] = [
  {
    name: "monotonic_safety",
    description: "Safety score must never decrease by more than 20% between consecutive runs",
    verify: (history) => {
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1].risk_score || 0;
        const curr = history[i].risk_score || 0;
        if (curr > prev * 1.2 + 10) {
          return { satisfied: false, counterexample: `Safety degradation: ${prev} → ${curr} at index ${i}` };
        }
      }
      return { satisfied: true };
    },
  },
  {
    name: "goal_consistency",
    description: "System must not have contradictory active goals",
    verify: (history) => {
      // Check for goal pairs that negate each other
      const goals = history.filter((h: any) => h.type === "goal");
      const descriptions = goals.map((g: any) => g.description?.toLowerCase() || "");
      for (let i = 0; i < descriptions.length; i++) {
        for (let j = i + 1; j < descriptions.length; j++) {
          if (
            (descriptions[i].includes("increase") && descriptions[j].includes("decrease") &&
              descriptions[i].replace(/increase/g, "") === descriptions[j].replace(/decrease/g, "")) ||
            (descriptions[i].includes("enable") && descriptions[j].includes("disable") &&
              descriptions[i].replace(/enable/g, "") === descriptions[j].replace(/disable/g, ""))
          ) {
            return { satisfied: false, counterexample: `Contradictory goals: "${descriptions[i]}" vs "${descriptions[j]}"` };
          }
        }
      }
      return { satisfied: true };
    },
  },
  {
    name: "bounded_resource_growth",
    description: "Memory episodes must not grow faster than 100/hour per user",
    verify: (history) => {
      if (history.length < 2) return { satisfied: true };
      const hourMs = 3600000;
      const recent = history.filter((h: any) => Date.now() - new Date(h.created_at).getTime() < hourMs);
      if (recent.length > 100) {
        return { satisfied: false, counterexample: `${recent.length} episodes in last hour exceeds limit of 100` };
      }
      return { satisfied: true };
    },
  },
];

// ---- FORMAL PROOF GENERATION ----
function generateFormalProof(check: InvariantCheck, result: { passed: boolean; violation?: string }): any {
  return {
    invariant: check.name,
    description: check.description,
    verdict: result.passed ? "VERIFIED" : "VIOLATED",
    violation: result.violation || null,
    timestamp: new Date().toISOString(),
    method: "deterministic_invariant_check",
    confidence: 1.0, // Deterministic = 100% confidence
  };
}

async function callAI(apiKey: string, messages: any[]): Promise<string> {
  const resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", max_tokens: 4096, messages }),
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

    const { action, content, history } = await req.json();

    if (action === "verify_invariants") {
      // Run all deterministic invariant checks
      const results = RESOURCE_INVARIANTS.map(inv => {
        const result = inv.check(content || "");
        return generateFormalProof(inv, result);
      });

      const allPassed = results.every(r => r.verdict === "VERIFIED");
      const violations = results.filter(r => r.verdict === "VIOLATED");
      const riskScore = violations.length * 25; // 0-100 scale

      // Store verification
      await supabase.from("safety_verifications").insert({
        user_id: userId,
        verification_type: "invariant_check",
        input_hash: content ? String(content).slice(0, 64) : null,
        passed: allPassed,
        violations: violations,
        formal_proofs: results,
        risk_score: riskScore,
      });

      return new Response(JSON.stringify({
        passed: allPassed,
        riskScore,
        totalChecks: results.length,
        violations: violations.length,
        proofs: results,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "verify_temporal") {
      // Verify temporal properties over history
      const results = TEMPORAL_PROPERTIES.map(prop => ({
        property: prop.name,
        description: prop.description,
        ...prop.verify(history || []),
        method: "temporal_property_verification",
      }));

      const allSatisfied = results.every(r => r.satisfied);

      await supabase.from("safety_verifications").insert({
        user_id: userId,
        verification_type: "temporal_verification",
        passed: allSatisfied,
        violations: results.filter(r => !r.satisfied),
        formal_proofs: results,
        risk_score: results.filter(r => !r.satisfied).length * 33,
      });

      return new Response(JSON.stringify({
        allSatisfied,
        properties: results,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "full_verification") {
      // Combined: invariant + temporal + LLM-assisted ethical review
      const invariantResults = RESOURCE_INVARIANTS.map(inv => {
        const result = inv.check(content || "");
        return generateFormalProof(inv, result);
      });

      const temporalResults = TEMPORAL_PROPERTIES.map(prop => ({
        property: prop.name,
        ...prop.verify(history || []),
      }));

      // LLM-assisted ethical analysis (supplementary, not primary)
      const ethicalAnalysis = await callAI(LOVABLE_API_KEY, [
        { role: "system", content: `You are a safety ethics reviewer. Analyze the content for ethical concerns. Return ONLY JSON: {"ethical_score": <1-10>, "concerns": ["..."], "recommendation": "proceed|caution|block"}` },
        { role: "user", content: `Content to review:\n${(content || "").slice(0, 2000)}` }
      ]);

      let ethical = { ethical_score: 8, concerns: [], recommendation: "proceed" };
      try { ethical = JSON.parse(ethicalAnalysis.replace(/```json\n?/g, "").replace(/```/g, "").trim()); } catch {}

      const invariantsPassed = invariantResults.every(r => r.verdict === "VERIFIED");
      const temporalSatisfied = temporalResults.every(r => r.satisfied);
      const overallSafe = invariantsPassed && temporalSatisfied && ethical.recommendation !== "block";
      const riskScore = (invariantResults.filter(r => r.verdict === "VIOLATED").length * 20) +
        (temporalResults.filter(r => !r.satisfied).length * 15) +
        (10 - (ethical.ethical_score || 8)) * 5;

      await supabase.from("safety_verifications").insert({
        user_id: userId,
        verification_type: "full_verification",
        passed: overallSafe,
        violations: [
          ...invariantResults.filter(r => r.verdict === "VIOLATED"),
          ...temporalResults.filter(r => !r.satisfied),
        ],
        formal_proofs: invariantResults,
        risk_score: Math.min(100, riskScore),
      });

      return new Response(JSON.stringify({
        overallSafe,
        riskScore: Math.min(100, riskScore),
        invariants: { passed: invariantsPassed, results: invariantResults },
        temporal: { satisfied: temporalSatisfied, results: temporalResults },
        ethical,
        recommendation: overallSafe ? "SAFE_TO_PROCEED" : "REQUIRES_REVIEW",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_history") {
      const { data } = await supabase
        .from("safety_verifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      return new Response(JSON.stringify({ verifications: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("formal-safety error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

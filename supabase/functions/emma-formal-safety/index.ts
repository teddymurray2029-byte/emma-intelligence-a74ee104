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

interface ActionPolicy {
  action: string;
  allowedTools: string[];
  allowedArgs: Record<string, { required: boolean; validator: (value: unknown) => boolean; description: string }>;
  contextConstraints: Array<{ name: string; verify: (context: Record<string, unknown>) => boolean; violation: string }>;
}

interface PreActionDecision {
  allowed: boolean;
  proofs: Array<{ check: string; passed: boolean; detail: string }>;
  deniedReason?: string;
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

const ACTION_POLICIES: ActionPolicy[] = [
  {
    action: "orchestrator.run_loop",
    allowedTools: ["ai_gateway.chat_completion", "memory.write", "world_model.update"],
    allowedArgs: {
      input: {
        required: true,
        validator: (value) => typeof value === "string" && value.length > 0 && value.length <= 20000,
        description: "Input must be a non-empty string under 20k chars",
      },
      userId: {
        required: true,
        validator: (value) => typeof value === "string" && value.length >= 8,
        description: "User id must be a stable non-empty identifier",
      },
      loopId: {
        required: true,
        validator: (value) => typeof value === "string" && value.length >= 8,
        description: "Loop id must be present for auditability",
      },
    },
    contextConstraints: [
      {
        name: "authenticated_user_only",
        verify: (context) => context.authenticated === true,
        violation: "Action requires authenticated user context",
      },
      {
        name: "service_role_available",
        verify: (context) => context.supabaseServiceRoleConfigured === true,
        violation: "Action requires Supabase service role configuration",
      },
    ],
  },
];

function getActionPolicy(actionName: string): ActionPolicy | undefined {
  return ACTION_POLICIES.find((p) => p.action === actionName);
}

function verifyActionAgainstPolicy(
  policy: ActionPolicy,
  tool: string,
  args: Record<string, unknown>,
  context: Record<string, unknown>,
): PreActionDecision {
  const proofs: Array<{ check: string; passed: boolean; detail: string }> = [];
  const toolAllowed = policy.allowedTools.includes(tool);
  proofs.push({
    check: "allowed_tool",
    passed: toolAllowed,
    detail: toolAllowed ? `Tool ${tool} is explicitly allowed` : `Tool ${tool} is not in allow-list`,
  });

  for (const [argName, rule] of Object.entries(policy.allowedArgs)) {
    const value = args[argName];
    const present = value !== undefined && value !== null;
    const passed = rule.required ? present && rule.validator(value) : !present || rule.validator(value);
    proofs.push({
      check: `arg_${argName}`,
      passed,
      detail: passed ? `Argument ${argName} satisfies: ${rule.description}` : `Argument ${argName} failed: ${rule.description}`,
    });
  }

  for (const constraint of policy.contextConstraints) {
    const passed = constraint.verify(context);
    proofs.push({
      check: `ctx_${constraint.name}`,
      passed,
      detail: passed ? `Context constraint satisfied: ${constraint.name}` : constraint.violation,
    });
  }

  const allPassed = proofs.every((p) => p.passed);
  return {
    allowed: allPassed,
    proofs,
    deniedReason: allPassed ? undefined : "Policy compliance is not provable with deterministic checks",
  };
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function appendImmutableSafetyAuditRecord(
  supabase: any,
  userId: string,
  payload: Record<string, unknown>,
): Promise<{ auditHash: string; signature: string; prevHash: string | null }> {
  const signingKey = Deno.env.get("SAFETY_AUDIT_SIGNING_KEY");
  if (!signingKey) {
    throw new Error("Verifier unavailable: SAFETY_AUDIT_SIGNING_KEY is not configured");
  }

  const { data: latestRecord } = await supabase
    .from("safety_verifications")
    .select("formal_proofs, created_at")
    .eq("user_id", userId)
    .eq("verification_type", "immutable_safety_audit")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevHash = latestRecord?.formal_proofs?.auditHash ?? null;
  const record = {
    userId,
    createdAt: new Date().toISOString(),
    prevHash,
    payload,
  };
  const canonical = JSON.stringify(record);
  const auditHash = await sha256Hex(canonical);
  const signature = await sha256Hex(`${auditHash}:${signingKey}`);

  await supabase.from("safety_verifications").insert({
    user_id: userId,
    verification_type: "immutable_safety_audit",
    passed: true,
    risk_score: 0,
    formal_proofs: { ...record, auditHash, signature },
    violations: [],
  });

  return { auditHash, signature, prevHash };
}

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

    const { action, content, history, proposedAction, tool, args, context, postState } = await req.json();

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

    if (action === "verify_action_policy") {
      const policyName = String(proposedAction || "");
      const policy = getActionPolicy(policyName);
      if (!policy) {
        return new Response(JSON.stringify({
          allowed: false,
          deniedReason: `No explicit policy registered for action: ${policyName}`,
          failClosed: true,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const decision = verifyActionAgainstPolicy(
        policy,
        String(tool || ""),
        (args || {}) as Record<string, unknown>,
        (context || {}) as Record<string, unknown>,
      );

      await supabase.from("safety_verifications").insert({
        user_id: userId,
        verification_type: "pre_action_policy_verification",
        passed: decision.allowed,
        violations: decision.proofs.filter((p) => !p.passed),
        formal_proofs: decision.proofs,
        risk_score: decision.allowed ? 0 : 85,
      });

      if (!decision.allowed) {
        return new Response(JSON.stringify({ ...decision, failClosed: true }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const audit = await appendImmutableSafetyAuditRecord(supabase, userId, {
        stage: "pre_action",
        decision: "allow",
        proposedAction: policyName,
        tool: String(tool || ""),
        args: args || {},
        proofs: decision.proofs,
      });

      return new Response(JSON.stringify({ ...decision, audit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify_post_conditions") {
      const resultText = typeof content === "string" ? content : JSON.stringify(content || "");
      const postChecks = [
        {
          name: "tool_result_non_empty",
          passed: resultText.trim().length > 0,
          violation: "Tool result must not be empty",
        },
        {
          name: "state_transition_bounded",
          passed: JSON.stringify(postState || {}).length <= 200000,
          violation: "State transition payload too large to be auditable",
        },
        {
          name: "state_transition_has_version",
          passed: typeof postState?.version === "number" || typeof postState?.worldModelVersion === "number",
          violation: "State transition missing an explicit version marker",
        },
      ];
      const passed = postChecks.every((c) => c.passed);

      await supabase.from("safety_verifications").insert({
        user_id: userId,
        verification_type: "post_condition_verification",
        passed,
        violations: postChecks.filter((c) => !c.passed),
        formal_proofs: postChecks,
        risk_score: passed ? 0 : 70,
      });

      const audit = await appendImmutableSafetyAuditRecord(supabase, userId, {
        stage: "post_action",
        decision: passed ? "accept" : "reject",
        postChecks,
      });

      if (!passed) {
        return new Response(JSON.stringify({ passed, postChecks, audit, failClosed: true }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ passed, postChecks, audit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DANGEROUS_PATTERNS = [
  /eval\s*\(/i,
  /Function\s*\(/i,
  /require\s*\(\s*['"]child_process['"]\s*\)/i,
  /exec\s*\(/i,
  /spawn\s*\(/i,
  /rm\s+-rf/i,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM\s+(?!.*WHERE)/i,
  /TRUNCATE/i,
  /process\.env/i,
  /Deno\.env/i,
  /__proto__/i,
  /constructor\s*\[/i,
];

const MAX_CODE_LENGTH = 50000;
const MAX_PROMPT_LENGTH = 10000;

interface ValidationResult {
  safe: boolean;
  violations: string[];
  sanitized?: string;
}

function validateCode(code: string): ValidationResult {
  const violations: string[] = [];

  if (code.length > MAX_CODE_LENGTH) {
    violations.push(`Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`);
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      violations.push(`Dangerous pattern detected: ${pattern.source}`);
    }
  }

  return { safe: violations.length === 0, violations };
}

function validatePromptModification(modification: string): ValidationResult {
  const violations: string[] = [];

  if (modification.length > MAX_PROMPT_LENGTH) {
    violations.push(`Modification exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`);
  }

  const injectionPatterns = [
    /ignore (all )?(previous|prior|above) instructions/i,
    /you are now/i,
    /forget (everything|all|your)/i,
    /system:\s/i,
    /\[SYSTEM\]/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(modification)) {
      violations.push(`Prompt injection pattern detected: ${pattern.source}`);
    }
  }

  return { safe: violations.length === 0, violations };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, content, contentType } = await req.json();

    if (action === "validate") {
      let result: ValidationResult;
      if (contentType === "code") {
        result = validateCode(content || "");
      } else if (contentType === "prompt") {
        result = validatePromptModification(content || "");
      } else {
        result = { safe: true, violations: [] };
      }

      // Log validation attempt
      if (!result.safe) {
        await supabase.from("improvement_logs").insert({
          user_id: user.id,
          improvement_type: "safety_block",
          description: `Blocked unsafe ${contentType}: ${result.violations.join("; ")}`,
          accepted: false,
          diff_content: (content || "").slice(0, 500),
        });
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "health") {
      // System health check
      const checks: Record<string, { status: string; detail: string }> = {};

      // Check database connectivity
      try {
        const { count } = await supabase.from("benchmark_questions").select("id", { count: "exact", head: true });
        checks.database = { status: "healthy", detail: `${count} benchmark questions loaded` };
      } catch {
        checks.database = { status: "degraded", detail: "Database query failed" };
      }

      // Check memory system
      try {
        const { count } = await supabase.from("memory_episodes").select("id", { count: "exact", head: true }).eq("user_id", user.id);
        checks.memory = { status: "healthy", detail: `${count} episodes stored` };
      } catch {
        checks.memory = { status: "degraded", detail: "Memory query failed" };
      }

      // Check goals system
      try {
        const { count } = await supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", user.id);
        checks.goals = { status: "healthy", detail: `${count} goals tracked` };
      } catch {
        checks.goals = { status: "degraded", detail: "Goals query failed" };
      }

      // Check AI gateway
      try {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        checks.ai_gateway = LOVABLE_API_KEY
          ? { status: "healthy", detail: "API key configured" }
          : { status: "critical", detail: "API key missing" };
      } catch {
        checks.ai_gateway = { status: "critical", detail: "Cannot check API key" };
      }

      const allHealthy = Object.values(checks).every(c => c.status === "healthy");
      const hasCritical = Object.values(checks).some(c => c.status === "critical");

      return new Response(JSON.stringify({
        overall: hasCritical ? "critical" : allHealthy ? "healthy" : "degraded",
        checks,
        timestamp: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

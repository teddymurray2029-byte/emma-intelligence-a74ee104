import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guardRequest, jsonResponse, safeError } from "../_shared/request-guard.ts";

const DANGEROUS_PATTERNS = [/eval\s*\(/i, /Function\s*\(/i, /require\s*\(\s*['\"]child_process['\"]\s*\)/i, /exec\s*\(/i, /spawn\s*\(/i, /rm\s+-rf/i, /DROP\s+TABLE/i, /DELETE\s+FROM\s+(?!.*WHERE)/i, /TRUNCATE/i, /process\.env/i, /Deno\.env/i, /__proto__/i, /constructor\s*\[/i];

function validateCode(code: string) {
  const violations: string[] = [];
  if (code.length > 50000) violations.push("Code exceeds max length");
  for (const p of DANGEROUS_PATTERNS) if (p.test(code)) violations.push(`Dangerous pattern: ${p.source}`);
  return { safe: violations.length === 0, violations };
}

function validatePrompt(mod: string) {
  const violations: string[] = [];
  if (mod.length > 10000) violations.push("Too long");
  const injections = [/ignore (all )?(previous|prior|above) instructions/i, /you are now/i, /forget (everything|all|your)/i, /system:\s/i, /\[SYSTEM\]/i];
  for (const p of injections) if (p.test(mod)) violations.push(`Injection: ${p.source}`);
  return { safe: violations.length === 0, violations };
}

serve(async (req) => {
  const guard = await guardRequest(req, {
    functionName: "emma-safety",
    allowAnonymous: true,
    actionValidators: {
      validate: (body) => typeof body.content === "string" && typeof body.contentType === "string" ? null : "validate requires content and contentType",
      health: () => null,
    },
    rateLimit: { windowMs: 60_000, max: 60 },
  });
  if (guard.response) return guard.response;

  try {
    const { action, body, userId, userClient } = guard;

    if (action === "validate") {
      const content = (body.content as string) || "";
      const contentType = (body.contentType as string) || "";
      const result = contentType === "code" ? validateCode(content) : contentType === "prompt" ? validatePrompt(content) : { safe: true, violations: [] };
      if (!result.safe && userId) {
        await userClient.from("improvement_logs").insert({ user_id: userId, improvement_type: "safety_block", description: `Blocked ${contentType}: ${result.violations.join("; ")}`, accepted: false, diff_content: content.slice(0, 500) });
      }
      return jsonResponse(result as unknown as Record<string, unknown>);
    }

    const checks: Record<string, unknown> = {};
    try { const { count } = await guard.adminClient.from("benchmark_questions").select("id", { count: "exact", head: true }); checks.database = { status: "healthy", detail: `${count} questions` }; } catch { checks.database = { status: "degraded" }; }
    try { const { count } = await userClient.from("memory_episodes").select("id", { count: "exact", head: true }).eq("user_id", userId); checks.memory = { status: "healthy", detail: `${count} episodes` }; } catch { checks.memory = { status: "degraded" }; }
    checks.ai_gateway = Deno.env.get("LOVABLE_API_KEY") ? { status: "healthy" } : { status: "critical" };
    const allHealthy = Object.values(checks).every((c: any) => c.status === "healthy");
    return jsonResponse({ overall: allHealthy ? "healthy" : "degraded", checks, timestamp: new Date().toISOString() });
  } catch (e) {
    return safeError("emma-safety", e);
  }
});

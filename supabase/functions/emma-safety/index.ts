import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));

async function getClerkUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try { const { payload } = await jwtVerify(token, JWKS); return (payload.sub as string) || null; } catch { return null; }
}

const DANGEROUS_PATTERNS = [/eval\s*\(/i, /Function\s*\(/i, /require\s*\(\s*['"]child_process['"]\s*\)/i, /exec\s*\(/i, /spawn\s*\(/i, /rm\s+-rf/i, /DROP\s+TABLE/i, /DELETE\s+FROM\s+(?!.*WHERE)/i, /TRUNCATE/i, /process\.env/i, /Deno\.env/i, /__proto__/i, /constructor\s*\[/i];

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, content, contentType } = await req.json();

    if (action === "validate") {
      const result = contentType === "code" ? validateCode(content || "") : contentType === "prompt" ? validatePrompt(content || "") : { safe: true, violations: [] };
      if (!result.safe) await supabase.from("improvement_logs").insert({ user_id: userId, improvement_type: "safety_block", description: `Blocked ${contentType}: ${result.violations.join("; ")}`, accepted: false, diff_content: (content || "").slice(0, 500) });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "health") {
      const checks: Record<string, any> = {};
      try { const { count } = await supabase.from("benchmark_questions").select("id", { count: "exact", head: true }); checks.database = { status: "healthy", detail: `${count} questions` }; } catch { checks.database = { status: "degraded" }; }
      try { const { count } = await supabase.from("memory_episodes").select("id", { count: "exact", head: true }).eq("user_id", userId); checks.memory = { status: "healthy", detail: `${count} episodes` }; } catch { checks.memory = { status: "degraded" }; }
      checks.ai_gateway = Deno.env.get("LOVABLE_API_KEY") ? { status: "healthy" } : { status: "critical" };
      const allHealthy = Object.values(checks).every((c: any) => c.status === "healthy");
      return new Response(JSON.stringify({ overall: allHealthy ? "healthy" : "degraded", checks, timestamp: new Date().toISOString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

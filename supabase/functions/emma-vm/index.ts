// Persistent Emma OS: long-lived E2B sandbox per user. Boot/run/snapshot/destroy.
// Uses E2B_API_KEY. Persists sandbox metadata in agent_tools (kind=vm) for the user.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const E2B_BASE = "https://api.e2b.dev";

async function e2b(path: string, init: RequestInit = {}): Promise<Response> {
  const key = Deno.env.get("E2B_API_KEY")!;
  return fetch(`${E2B_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), "X-API-KEY": key, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userId = await getClerkUserId(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!Deno.env.get("E2B_API_KEY")) return new Response(JSON.stringify({ error: "E2B not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action, command, sandbox_id, code, language = "python" } = await req.json();

    // Find user's persistent VM record
    const { data: existing } = await supabase.from("agent_tools").select("*").eq("user_id", userId).eq("name", "__emma_vm__").maybeSingle();

    if (action === "boot") {
      if (existing?.endpoint) return new Response(JSON.stringify({ sandbox_id: existing.endpoint, reused: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const r = await e2b("/sandboxes", { method: "POST", body: JSON.stringify({ templateID: "base", timeout: 3600 }) });
      if (!r.ok) {
        const t = await r.text();
        return new Response(JSON.stringify({ error: "Failed to boot sandbox", detail: t.slice(0, 300) }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const sb = await r.json();
      const id = sb.sandboxID || sb.id;
      await supabase.from("agent_tools").upsert({
        user_id: userId, name: "__emma_vm__", description: "Emma OS persistent sandbox", endpoint: id, status: "active", spec: { booted_at: new Date().toISOString() },
      }, { onConflict: "user_id,name" });
      return new Response(JSON.stringify({ sandbox_id: id, reused: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "exec") {
      const sid = sandbox_id || existing?.endpoint;
      if (!sid) return new Response(JSON.stringify({ error: "no sandbox; boot first" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // Use E2B execute endpoint
      const r = await e2b(`/sandboxes/${sid}/exec`, { method: "POST", body: JSON.stringify({ cmd: command || `${language === "python" ? "python3 -c" : "node -e"} ${JSON.stringify(code || "")}` }) });
      const text = await r.text();
      return new Response(JSON.stringify({ status: r.status, output: text.slice(0, 4000) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "destroy") {
      const sid = existing?.endpoint;
      if (sid) await e2b(`/sandboxes/${sid}`, { method: "DELETE" });
      if (existing) await supabase.from("agent_tools").delete().eq("id", existing.id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "status") {
      return new Response(JSON.stringify({ sandbox_id: existing?.endpoint || null, booted_at: existing?.spec?.booted_at || null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("vm error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

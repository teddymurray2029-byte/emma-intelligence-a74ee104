// Constitutional personalization: per-user rules versioned + active flag. Loaded into every system prompt.
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

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action, rules, version } = await req.json();

    if (action === "get_active") {
      const { data } = await supabase.from("constitutions").select("*").eq("user_id", userId).eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle();
      return new Response(JSON.stringify({ constitution: data || null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "list") {
      const { data } = await supabase.from("constitutions").select("*").eq("user_id", userId).order("version", { ascending: false });
      return new Response(JSON.stringify({ constitutions: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "save") {
      if (!rules || typeof rules !== "string" || rules.length > 10000) return new Response(JSON.stringify({ error: "rules required (≤10000 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // Get next version
      const { data: latest } = await supabase.from("constitutions").select("version").eq("user_id", userId).order("version", { ascending: false }).limit(1).maybeSingle();
      const nextV = (latest?.version || 0) + 1;
      // Deactivate prior
      await supabase.from("constitutions").update({ active: false }).eq("user_id", userId);
      const { data: created } = await supabase.from("constitutions").insert({ user_id: userId, version: nextV, rules: rules.trim(), active: true }).select().single();
      return new Response(JSON.stringify({ constitution: created }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "rollback") {
      if (!version) return new Response(JSON.stringify({ error: "version required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      await supabase.from("constitutions").update({ active: false }).eq("user_id", userId);
      const { data } = await supabase.from("constitutions").update({ active: true }).eq("user_id", userId).eq("version", version).select().single();
      return new Response(JSON.stringify({ constitution: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("constitution error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

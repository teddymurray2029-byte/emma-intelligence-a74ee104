// Public capability report card. Returns latest scores per benchmark.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Latest score per benchmark
    const { data } = await supabase.from("capability_scores").select("*").order("measured_at", { ascending: false }).limit(100);
    const latest = new Map<string, any>();
    for (const row of data || []) if (!latest.has(row.benchmark)) latest.set(row.benchmark, row);
    return new Response(JSON.stringify({ scores: Array.from(latest.values()) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

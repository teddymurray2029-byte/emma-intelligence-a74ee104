// Agent Marketplace: browse / publish / install / uninstall agent personas + tools.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const VALID_CATEGORIES = ["agent", "tool", "workflow", "persona"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Public: browse + get a single item
    if (action === "list") {
      const category: string | undefined = body.category;
      const search: string | undefined = (body.search || "").toString().trim();
      let q = supabase.from("agent_marketplace").select("*").eq("published", true).order("install_count", { ascending: false }).limit(60);
      if (category && VALID_CATEGORIES.includes(category)) q = q.eq("category", category);
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return json({ items: data || [] });
    }

    if (action === "get") {
      const { id } = body;
      if (!id) return json({ error: "id required" }, 400);
      const { data } = await supabase.from("agent_marketplace").select("*").eq("id", id).eq("published", true).maybeSingle();
      if (!data) return json({ error: "not found" }, 404);
      return json({ item: data });
    }

    // Authenticated actions below
    const userId = await getClerkUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    if (action === "install") {
      const { id } = body;
      if (!id) return json({ error: "id required" }, 400);
      const { data: item } = await supabase.from("agent_marketplace").select("id, install_count").eq("id", id).eq("published", true).maybeSingle();
      if (!item) return json({ error: "not found" }, 404);
      const { error } = await supabase.from("agent_installs").upsert({ user_id: userId, marketplace_id: id }, { onConflict: "user_id,marketplace_id" });
      if (error) throw error;
      await supabase.from("agent_marketplace").update({ install_count: (item.install_count || 0) + 1 }).eq("id", id);
      return json({ installed: true });
    }

    if (action === "uninstall") {
      const { id } = body;
      if (!id) return json({ error: "id required" }, 400);
      await supabase.from("agent_installs").delete().eq("user_id", userId).eq("marketplace_id", id);
      return json({ uninstalled: true });
    }

    if (action === "my_installs") {
      const { data } = await supabase
        .from("agent_installs")
        .select("installed_at, marketplace_id, agent_marketplace(*)")
        .eq("user_id", userId)
        .order("installed_at", { ascending: false });
      return json({ installs: data || [] });
    }

    if (action === "publish") {
      const { name, description, category = "agent", manifest = {}, published = true } = body;
      if (!name || !description) return json({ error: "name and description required" }, 400);
      if (!VALID_CATEGORIES.includes(category)) return json({ error: "invalid category" }, 400);
      if (String(name).length > 100 || String(description).length > 1000) return json({ error: "name/description too long" }, 400);
      const { data, error } = await supabase.from("agent_marketplace").insert({
        author_id: userId,
        name: String(name).slice(0, 100),
        description: String(description).slice(0, 1000),
        category,
        manifest,
        published: Boolean(published),
      }).select().single();
      if (error) throw error;
      return json({ item: data });
    }

    if (action === "my_published") {
      const { data } = await supabase.from("agent_marketplace").select("*").eq("author_id", userId).order("created_at", { ascending: false });
      return json({ items: data || [] });
    }

    if (action === "unpublish") {
      const { id } = body;
      if (!id) return json({ error: "id required" }, 400);
      await supabase.from("agent_marketplace").update({ published: false }).eq("id", id).eq("author_id", userId);
      return json({ ok: true });
    }

    return json({ error: "invalid action" }, 400);
  } catch (e) {
    console.error("marketplace error", e);
    return json({ error: e instanceof Error ? e.message : "Internal" }, 500);
  }
});

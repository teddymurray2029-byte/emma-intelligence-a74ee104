import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));

async function getClerkUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS);
    return (payload.sub as string) || null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getClerkUserId(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const { action } = body;

    // Allow anonymous access for usage tracking actions
    const anonAllowed = ["check_usage", "track_usage"];
    if (!userId && !anonAllowed.includes(action)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "list_conversations": {
        const { data } = await supabase
          .from("conversations")
          .select("id, title, created_at, updated_at, parent_id")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        return json({ data: data || [] });
      }

      case "create_conversation": {
        const { title } = body;
        const { data, error } = await supabase
          .from("conversations")
          .insert({ user_id: userId, title: title || "New Conversation" })
          .select("id, title, created_at, updated_at")
          .single();
        if (error) return json({ error: error.message }, 400);
        return json({ data });
      }

      case "delete_conversation": {
        const { id } = body;
        // Verify ownership
        const { data: conv } = await supabase.from("conversations").select("user_id").eq("id", id).single();
        if (!conv || conv.user_id !== userId) return json({ error: "Not found" }, 404);
        await supabase.from("messages").delete().eq("conversation_id", id);
        await supabase.from("conversations").delete().eq("id", id);
        return json({ success: true });
      }

      case "rename_conversation": {
        const { id, title } = body;
        const { data: conv } = await supabase.from("conversations").select("user_id").eq("id", id).single();
        if (!conv || conv.user_id !== userId) return json({ error: "Not found" }, 404);
        await supabase.from("conversations").update({ title }).eq("id", id);
        return json({ success: true });
      }

      case "update_conversation": {
        const { id, updates } = body;
        const { data: conv } = await supabase.from("conversations").select("user_id").eq("id", id).single();
        if (!conv || conv.user_id !== userId) return json({ error: "Not found" }, 404);
        const allowed: Record<string, any> = {};
        if (updates.title) allowed.title = updates.title;
        if (updates.parent_id) allowed.parent_id = updates.parent_id;
        await supabase.from("conversations").update(allowed).eq("id", id);
        return json({ success: true });
      }

      case "list_messages": {
        const { conversation_id } = body;
        // Verify ownership
        const { data: conv } = await supabase.from("conversations").select("user_id").eq("id", conversation_id).single();
        if (!conv || conv.user_id !== userId) return json({ error: "Not found" }, 404);
        const { data } = await supabase
          .from("messages")
          .select("role, content, metadata")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: true });
        return json({ data: data || [] });
      }

      case "save_message": {
        const { conversation_id, role, content, metadata } = body;
        const { data: conv } = await supabase.from("conversations").select("user_id").eq("id", conversation_id).single();
        if (!conv || conv.user_id !== userId) return json({ error: "Not found" }, 404);
        await supabase.from("messages").insert({
          conversation_id, role, content, metadata: metadata || {},
        });
        return json({ success: true });
      }

      case "check_admin": {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin");
        return json({ isAdmin: (data?.length || 0) > 0 });
      }

      case "upsert_profile": {
        const { display_name, avatar_url } = body;
        const { data: existing } = await supabase.from("profiles").select("id").eq("id", userId).single();
        if (existing) {
          await supabase.from("profiles").update({ display_name, avatar_url, updated_at: new Date().toISOString() }).eq("id", userId);
        } else {
          await supabase.from("profiles").insert({ id: userId, display_name, avatar_url });
        }
        return json({ success: true });
      }

      case "check_usage": {
        const { fingerprint } = body;
        if (!fingerprint) return json({ error: "Missing fingerprint" }, 400);
        const { data } = await supabase.from("usage_tracking").select("*").eq("fingerprint", fingerprint).single();
        if (!data) return json({ data: { messages_used: 0, is_paid: false } });
        return json({ data });
      }

      case "track_usage": {
        const { fingerprint, ip_address } = body;
        if (!fingerprint) return json({ error: "Missing fingerprint" }, 400);
        const { data: existing } = await supabase.from("usage_tracking").select("*").eq("fingerprint", fingerprint).single();
        if (existing) {
          const ips = existing.ip_addresses || [];
          if (ip_address && !ips.includes(ip_address)) ips.push(ip_address);
          await supabase.from("usage_tracking").update({
            messages_used: existing.messages_used + 1,
            user_id: userId || existing.user_id,
            ip_addresses: ips,
            updated_at: new Date().toISOString(),
          }).eq("fingerprint", fingerprint);
          // Check for IP-based fingerprint linking (anti-abuse)
          if (ip_address) {
            const { data: sameIp } = await supabase.from("usage_tracking")
              .select("fingerprint").neq("fingerprint", fingerprint)
              .contains("ip_addresses", [ip_address]);
            if (sameIp?.length) {
              for (const other of sameIp) {
                await supabase.from("fingerprint_links").upsert({
                  primary_fingerprint: fingerprint,
                  linked_fingerprint: other.fingerprint,
                  link_type: "ip_match",
                }, { onConflict: "primary_fingerprint,linked_fingerprint" });
              }
            }
          }
          return json({ data: { messages_used: existing.messages_used + 1, is_paid: existing.is_paid } });
        } else {
          await supabase.from("usage_tracking").insert({
            fingerprint,
            user_id: userId || null,
            messages_used: 1,
            ip_addresses: ip_address ? [ip_address] : [],
          });
          return json({ data: { messages_used: 1, is_paid: false } });
        }
      }

      case "list_projects": {
        const { data } = await supabase
          .from("projects")
          .select("id, name, description, files, github_repo, created_at, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        return json({ data: data || [] });
      }

      case "create_project": {
        const { name, description } = body;
        const { data, error } = await supabase
          .from("projects")
          .insert({ user_id: userId, name: name || "Untitled Project", description: description || "" })
          .select("id, name, description, files, github_repo, created_at, updated_at")
          .single();
        if (error) return json({ error: error.message }, 400);
        return json({ data });
      }

      case "get_project": {
        const { id } = body;
        const { data } = await supabase.from("projects").select("*").eq("id", id).eq("user_id", userId).single();
        if (!data) return json({ error: "Not found" }, 404);
        return json({ data });
      }

      case "update_project": {
        const { id, updates } = body;
        const { data: proj } = await supabase.from("projects").select("user_id").eq("id", id).single();
        if (!proj || proj.user_id !== userId) return json({ error: "Not found" }, 404);
        const allowed: Record<string, any> = {};
        if (updates.name) allowed.name = updates.name;
        if (updates.description !== undefined) allowed.description = updates.description;
        if (updates.github_repo !== undefined) allowed.github_repo = updates.github_repo;
        allowed.updated_at = new Date().toISOString();
        await supabase.from("projects").update(allowed).eq("id", id);
        return json({ success: true });
      }

      case "update_project_files": {
        const { id, files } = body;
        const { data: proj } = await supabase.from("projects").select("user_id").eq("id", id).single();
        if (!proj || proj.user_id !== userId) return json({ error: "Not found" }, 404);
        await supabase.from("projects").update({ files, updated_at: new Date().toISOString() }).eq("id", id);
        return json({ success: true });
      }

      case "delete_project": {
        const { id } = body;
        const { data: proj } = await supabase.from("projects").select("user_id").eq("id", id).single();
        if (!proj || proj.user_id !== userId) return json({ error: "Not found" }, 404);
        await supabase.from("projects").delete().eq("id", id);
        return json({ success: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("emma-db-proxy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

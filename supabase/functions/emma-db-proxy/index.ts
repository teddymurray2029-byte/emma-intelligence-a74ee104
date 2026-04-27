import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guardRequest, jsonResponse, safeError } from "../_shared/request-guard.ts";

serve(async (req) => {
  const guard = await guardRequest(req, {
    functionName: "emma-db-proxy",
    allowAnonymous: true,
    rateLimit: { windowMs: 60_000, max: 120 },
  });
  if (guard.response) return guard.response;

  try {
    const userId = guard.userId;
    const body = guard.body as Record<string, any>;
    const { action } = body;

    const anonAllowed = ["check_usage", "track_usage"];
    if (!userId && !anonAllowed.includes(action)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Auth is verified via Clerk JWT in guardRequest; use admin client for DB access
    // since RLS policies only grant service_role and Clerk JWTs aren't recognized by Supabase RLS.
    const supabase = guard.adminClient;

    switch (action) {
      case "list_conversations": {
        const { data } = await supabase
          .from("conversations")
          .select("id, title, created_at, updated_at, parent_id")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        return jsonResponse({ data: data || [] });
      }

      case "create_conversation": {
        const { title } = body;
        const { data, error } = await supabase
          .from("conversations")
          .insert({ user_id: userId, title: title || "New Conversation" })
          .select("id, title, created_at, updated_at")
          .single();
        if (error) return jsonResponse({ error: "Database operation failed" }, 400);
        return jsonResponse({ data });
      }

      case "delete_conversation": {
        const { id } = body;
        // Verify ownership
        const { data: conv } = await supabase.from("conversations").select("user_id").eq("id", id).single();
        if (!conv || conv.user_id !== userId) return jsonResponse({ error: "Not found" }, 404);
        await supabase.from("messages").delete().eq("conversation_id", id);
        await supabase.from("conversations").delete().eq("id", id);
        return jsonResponse({ success: true });
      }

      case "rename_conversation": {
        const { id, title } = body;
        const { data: conv } = await supabase.from("conversations").select("user_id").eq("id", id).single();
        if (!conv || conv.user_id !== userId) return jsonResponse({ error: "Not found" }, 404);
        await supabase.from("conversations").update({ title }).eq("id", id);
        return jsonResponse({ success: true });
      }

      case "update_conversation": {
        const { id, updates } = body;
        const { data: conv } = await supabase.from("conversations").select("user_id").eq("id", id).single();
        if (!conv || conv.user_id !== userId) return jsonResponse({ error: "Not found" }, 404);
        const allowed: Record<string, any> = {};
        if (updates.title) allowed.title = updates.title;
        if (updates.parent_id) allowed.parent_id = updates.parent_id;
        await supabase.from("conversations").update(allowed).eq("id", id);
        return jsonResponse({ success: true });
      }

      case "list_messages": {
        const { conversation_id } = body;
        // Verify ownership
        const { data: conv } = await supabase.from("conversations").select("user_id").eq("id", conversation_id).single();
        if (!conv || conv.user_id !== userId) return jsonResponse({ error: "Not found" }, 404);
        const { data } = await supabase
          .from("messages")
          .select("role, content, metadata")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: true });
        return jsonResponse({ data: data || [] });
      }

      case "save_message": {
        const { conversation_id, role, content, metadata } = body;
        const { data: conv } = await supabase.from("conversations").select("user_id").eq("id", conversation_id).single();
        if (!conv || conv.user_id !== userId) return jsonResponse({ error: "Not found" }, 404);
        await supabase.from("messages").insert({
          conversation_id, role, content, metadata: metadata || {},
        });
        return jsonResponse({ success: true });
      }

      case "check_admin": {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin");
        return jsonResponse({ isAdmin: (data?.length || 0) > 0 });
      }

      case "upsert_profile": {
        const { display_name, avatar_url } = body;
        const { data: existing } = await supabase.from("profiles").select("id").eq("id", userId).single();
        if (existing) {
          await supabase.from("profiles").update({ display_name, avatar_url, updated_at: new Date().toISOString() }).eq("id", userId);
        } else {
          await supabase.from("profiles").insert({ id: userId, display_name, avatar_url });
        }
        return jsonResponse({ success: true });
      }

      case "check_usage": {
        const { fingerprint } = body;
        if (!fingerprint) return jsonResponse({ error: "Missing fingerprint" }, 400);
        const { data } = await supabase.from("usage_tracking").select("*").eq("fingerprint", fingerprint).single();
        if (!data) return jsonResponse({ data: { messages_used: 0, is_paid: false } });
        return jsonResponse({ data });
      }

      case "track_usage": {
        const { fingerprint, ip_address } = body;
        if (!fingerprint) return jsonResponse({ error: "Missing fingerprint" }, 400);
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
          return jsonResponse({ data: { messages_used: existing.messages_used + 1, is_paid: existing.is_paid } });
        } else {
          await supabase.from("usage_tracking").insert({
            fingerprint,
            user_id: userId || null,
            messages_used: 1,
            ip_addresses: ip_address ? [ip_address] : [],
          });
          return jsonResponse({ data: { messages_used: 1, is_paid: false } });
        }
      }

      case "list_projects": {
        const { data } = await supabase
          .from("projects")
          .select("id, name, description, files, github_repo, created_at, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        return jsonResponse({ data: data || [] });
      }

      case "create_project": {
        const { name, description } = body;
        const { data, error } = await supabase
          .from("projects")
          .insert({ user_id: userId, name: name || "Untitled Project", description: description || "" })
          .select("id, name, description, files, github_repo, created_at, updated_at")
          .single();
        if (error) return jsonResponse({ error: "Database operation failed" }, 400);
        return jsonResponse({ data });
      }

      case "get_project": {
        const { id } = body;
        const { data } = await supabase.from("projects").select("*").eq("id", id).eq("user_id", userId).single();
        if (!data) return jsonResponse({ error: "Not found" }, 404);
        return jsonResponse({ data });
      }

      case "update_project": {
        const { id, updates } = body;
        const { data: proj } = await supabase.from("projects").select("user_id").eq("id", id).single();
        if (!proj || proj.user_id !== userId) return jsonResponse({ error: "Not found" }, 404);
        const allowed: Record<string, any> = {};
        if (updates.name) allowed.name = updates.name;
        if (updates.description !== undefined) allowed.description = updates.description;
        if (updates.github_repo !== undefined) allowed.github_repo = updates.github_repo;
        allowed.updated_at = new Date().toISOString();
        await supabase.from("projects").update(allowed).eq("id", id);
        return jsonResponse({ success: true });
      }

      case "update_project_files": {
        const { id, files } = body;
        const { data: proj } = await supabase.from("projects").select("user_id").eq("id", id).single();
        if (!proj || proj.user_id !== userId) return jsonResponse({ error: "Not found" }, 404);
        await supabase.from("projects").update({ files, updated_at: new Date().toISOString() }).eq("id", id);
        return jsonResponse({ success: true });
      }

      case "delete_project": {
        const { id } = body;
        const { data: proj } = await supabase.from("projects").select("user_id").eq("id", id).single();
        if (!proj || proj.user_id !== userId) return jsonResponse({ error: "Not found" }, 404);
        await supabase.from("projects").delete().eq("id", id);
        return jsonResponse({ success: true });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return safeError("emma-db-proxy", e);
  }
});


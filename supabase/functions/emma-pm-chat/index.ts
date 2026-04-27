import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guardRequest, jsonResponse, safeError } from "../_shared/request-guard.ts";

async function getMember(supabase: any, workspaceId: string, userId: string) {
  const { data } = await supabase
    .from("pm_members")
    .select("role, display_name")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

function extractMentions(body: string): string[] {
  const matches = body.match(/@([a-zA-Z0-9._-]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

serve(async (req) => {
  const guard = await guardRequest(req, {
    functionName: "emma-pm-chat",
    allowAnonymous: false,
    rateLimit: { windowMs: 60_000, max: 300 },
  });
  if (guard.response) return guard.response;

  try {
    const supabase = guard.adminClient;
    const userId = guard.userId!;
    const body = guard.body as Record<string, any>;
    const action = body.action as string;

    switch (action) {
      case "list_channels": {
        const { workspace_id } = body;
        const m = await getMember(supabase, workspace_id, userId);
        if (!m) return jsonResponse({ error: "Not a member" }, 403);
        const { data } = await supabase
          .from("pm_channels")
          .select("*")
          .eq("workspace_id", workspace_id)
          .order("created_at");
        return jsonResponse({ data: data || [] });
      }

      case "create_channel": {
        const { workspace_id, name, topic, is_private } = body;
        const m = await getMember(supabase, workspace_id, userId);
        if (!m) return jsonResponse({ error: "Not a member" }, 403);
        const cleanName = (name || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
        if (!cleanName) return jsonResponse({ error: "Invalid name" }, 400);
        const { data, error } = await supabase.from("pm_channels")
          .insert({ workspace_id, name: cleanName, topic: topic || "", is_private: !!is_private, created_by: userId })
          .select().single();
        if (error) return jsonResponse({ error: error.message }, 400);
        await supabase.from("pm_channel_members").insert({ channel_id: data.id, user_id: userId });
        return jsonResponse({ data });
      }

      case "list_messages": {
        const { channel_id, story_id, limit = 100 } = body;
        let workspaceId: string | null = null;
        if (channel_id) {
          const { data: ch } = await supabase.from("pm_channels").select("workspace_id").eq("id", channel_id).single();
          workspaceId = ch?.workspace_id;
        } else if (story_id) {
          const { data: st } = await supabase.from("pm_stories").select("workspace_id").eq("id", story_id).single();
          workspaceId = st?.workspace_id;
        }
        if (!workspaceId) return jsonResponse({ error: "Missing channel or story" }, 400);
        const m = await getMember(supabase, workspaceId, userId);
        if (!m) return jsonResponse({ error: "Not a member" }, 403);
        let q = supabase.from("pm_chat_messages").select("*").eq("workspace_id", workspaceId);
        if (channel_id) q = q.eq("channel_id", channel_id);
        if (story_id) q = q.eq("story_id", story_id);
        const { data } = await q.order("created_at", { ascending: true }).limit(limit);
        return jsonResponse({ data: data || [] });
      }

      case "send_message": {
        const { channel_id, story_id, body: text, parent_message_id, attachments } = body;
        if (!text?.trim()) return jsonResponse({ error: "Empty message" }, 400);
        let workspaceId: string | null = null;
        if (channel_id) {
          const { data: ch } = await supabase.from("pm_channels").select("workspace_id").eq("id", channel_id).single();
          workspaceId = ch?.workspace_id;
        } else if (story_id) {
          const { data: st } = await supabase.from("pm_stories").select("workspace_id").eq("id", story_id).single();
          workspaceId = st?.workspace_id;
        }
        if (!workspaceId) return jsonResponse({ error: "Missing channel or story" }, 400);
        const m = await getMember(supabase, workspaceId, userId);
        if (!m) return jsonResponse({ error: "Not a member" }, 403);

        const mentions = extractMentions(text);
        const { data, error } = await supabase.from("pm_chat_messages").insert({
          workspace_id: workspaceId,
          channel_id: channel_id || null,
          story_id: story_id || null,
          parent_message_id: parent_message_id || null,
          author_id: userId,
          author_name: m.display_name || null,
          body: text.trim(),
          attachments: attachments || [],
          mentions,
        }).select().single();
        if (error) return jsonResponse({ error: error.message }, 400);

        // Notify mentioned users (best-effort)
        if (mentions.length > 0) {
          const { data: mems } = await supabase
            .from("pm_members")
            .select("user_id, display_name, email")
            .eq("workspace_id", workspaceId);
          const targets = (mems || []).filter((mm: any) =>
            mentions.some((tag) =>
              [mm.display_name, mm.email?.split("@")[0]].filter(Boolean).map((s: string) => s.toLowerCase()).includes(tag.toLowerCase()),
            ),
          );
          if (targets.length) {
            await supabase.from("pm_notifications").insert(
              targets.map((t: any) => ({
                user_id: t.user_id,
                workspace_id: workspaceId,
                kind: "mention",
                payload: { message_id: data.id, channel_id, story_id, snippet: text.slice(0, 140) },
              })),
            );
          }
        }
        return jsonResponse({ data });
      }

      case "react": {
        const { message_id, emoji } = body;
        const { data: msg } = await supabase.from("pm_chat_messages").select("workspace_id, reactions").eq("id", message_id).single();
        if (!msg) return jsonResponse({ error: "Not found" }, 404);
        const m = await getMember(supabase, msg.workspace_id, userId);
        if (!m) return jsonResponse({ error: "Not a member" }, 403);
        const reactions: Record<string, string[]> = msg.reactions || {};
        const list = new Set(reactions[emoji] || []);
        if (list.has(userId)) list.delete(userId);
        else list.add(userId);
        reactions[emoji] = [...list];
        if (reactions[emoji].length === 0) delete reactions[emoji];
        await supabase.from("pm_chat_messages").update({ reactions }).eq("id", message_id);
        return jsonResponse({ success: true });
      }

      case "list_notifications": {
        const { data } = await supabase.from("pm_notifications")
          .select("*").eq("user_id", userId)
          .order("created_at", { ascending: false }).limit(50);
        return jsonResponse({ data: data || [] });
      }

      case "mark_read": {
        const { ids } = body;
        if (Array.isArray(ids) && ids.length) {
          await supabase.from("pm_notifications").update({ read_at: new Date().toISOString() })
            .in("id", ids).eq("user_id", userId);
        }
        return jsonResponse({ success: true });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return safeError("emma-pm-chat", e);
  }
});

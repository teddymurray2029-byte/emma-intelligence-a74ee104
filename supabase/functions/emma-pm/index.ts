import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guardRequest, jsonResponse, safeError } from "../_shared/request-guard.ts";

type Role = "admin" | "mod" | "contributor" | "viewer";
const ROLE_RANK: Record<Role, number> = { viewer: 1, contributor: 2, mod: 3, admin: 4 };

async function getMember(supabase: any, workspaceId: string, userId: string) {
  const { data } = await supabase
    .from("pm_members")
    .select("role, id, display_name, email")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

function canAtLeast(member: any, role: Role) {
  if (!member) return false;
  return ROLE_RANK[member.role as Role] >= ROLE_RANK[role];
}

async function logActivity(
  supabase: any,
  workspaceId: string,
  storyId: string | null,
  actorId: string,
  action: string,
  payload: Record<string, unknown> = {},
) {
  await supabase.from("pm_activity").insert({
    workspace_id: workspaceId,
    story_id: storyId,
    actor_id: actorId,
    action,
    payload,
  });
}

serve(async (req) => {
  const guard = await guardRequest(req, {
    functionName: "emma-pm",
    allowAnonymous: false,
    rateLimit: { windowMs: 60_000, max: 240 },
  });
  if (guard.response) return guard.response;

  try {
    const supabase = guard.adminClient;
    const userId = guard.userId!;
    const body = guard.body as Record<string, any>;
    const action = body.action as string;

    switch (action) {
      // ===== WORKSPACES =====
      case "list_workspaces": {
        const { data: members } = await supabase
          .from("pm_members")
          .select("workspace_id, role")
          .eq("user_id", userId);
        const ids = (members || []).map((m: any) => m.workspace_id);
        if (ids.length === 0) return jsonResponse({ data: [] });
        const { data: ws } = await supabase
          .from("pm_workspaces")
          .select("*")
          .in("id", ids)
          .order("updated_at", { ascending: false });
        const roleMap = new Map((members || []).map((m: any) => [m.workspace_id, m.role]));
        return jsonResponse({ data: (ws || []).map((w: any) => ({ ...w, my_role: roleMap.get(w.id) })) });
      }

      case "create_workspace": {
        const { name, description, github_repo } = body;
        if (!name?.trim()) return jsonResponse({ error: "Name required" }, 400);
        const { data: ws, error } = await supabase
          .from("pm_workspaces")
          .insert({ name: name.trim(), description: description || "", owner_id: userId, github_repo: github_repo || null })
          .select()
          .single();
        if (error) return jsonResponse({ error: error.message }, 400);
        await supabase.from("pm_members").insert({
          workspace_id: ws.id, user_id: userId, role: "admin", display_name: body.display_name || null, email: body.email || null,
        });
        // Create default channels
        const { data: chans } = await supabase.from("pm_channels").insert([
          { workspace_id: ws.id, name: "general", topic: "Team-wide announcements", created_by: userId },
          { workspace_id: ws.id, name: "dev", topic: "Engineering chat", created_by: userId },
          { workspace_id: ws.id, name: "ai-runs", topic: "Emma AI activity", created_by: userId },
        ]).select();
        for (const c of chans || []) {
          await supabase.from("pm_channel_members").insert({ channel_id: c.id, user_id: userId });
        }
        await logActivity(supabase, ws.id, null, userId, "workspace_created", { name });
        return jsonResponse({ data: ws });
      }

      case "get_workspace": {
        const { workspace_id } = body;
        const member = await getMember(supabase, workspace_id, userId);
        if (!member) return jsonResponse({ error: "Not a member" }, 403);
        const { data: ws } = await supabase.from("pm_workspaces").select("*").eq("id", workspace_id).single();
        return jsonResponse({ data: { ...ws, my_role: member.role } });
      }

      case "update_workspace": {
        const { workspace_id, updates } = body;
        const member = await getMember(supabase, workspace_id, userId);
        if (!canAtLeast(member, "admin")) return jsonResponse({ error: "Admin only" }, 403);
        const allowed: any = {};
        ["name", "description", "github_repo", "slack_channel_id"].forEach((k) => {
          if (k in updates) allowed[k] = updates[k];
        });
        allowed.updated_at = new Date().toISOString();
        await supabase.from("pm_workspaces").update(allowed).eq("id", workspace_id);
        return jsonResponse({ success: true });
      }

      case "delete_workspace": {
        const { workspace_id } = body;
        const member = await getMember(supabase, workspace_id, userId);
        if (!canAtLeast(member, "admin")) return jsonResponse({ error: "Admin only" }, 403);
        await supabase.from("pm_workspaces").delete().eq("id", workspace_id);
        return jsonResponse({ success: true });
      }

      // ===== MEMBERS / INVITES =====
      case "list_members": {
        const { workspace_id } = body;
        const member = await getMember(supabase, workspace_id, userId);
        if (!member) return jsonResponse({ error: "Not a member" }, 403);
        const { data } = await supabase.from("pm_members").select("*").eq("workspace_id", workspace_id).order("joined_at");
        return jsonResponse({ data: data || [] });
      }

      case "invite_member": {
        const { workspace_id, email, role } = body;
        const member = await getMember(supabase, workspace_id, userId);
        if (!canAtLeast(member, "admin")) return jsonResponse({ error: "Admin only" }, 403);
        if (!email?.trim()) return jsonResponse({ error: "Email required" }, 400);
        const validRole: Role = ["admin", "mod", "contributor", "viewer"].includes(role) ? role : "contributor";
        const token = crypto.randomUUID().replace(/-/g, "");
        const { data: inv, error } = await supabase
          .from("pm_invites")
          .insert({ workspace_id, email: email.toLowerCase().trim(), role: validRole, token, invited_by: userId })
          .select()
          .single();
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ data: inv, invite_link: `/projects/join/${token}` });
      }

      case "accept_invite": {
        const { token, display_name, email } = body;
        const { data: inv } = await supabase
          .from("pm_invites")
          .select("*")
          .eq("token", token)
          .is("accepted_at", null)
          .maybeSingle();
        if (!inv) return jsonResponse({ error: "Invalid or expired invite" }, 404);
        if (new Date(inv.expires_at) < new Date()) return jsonResponse({ error: "Expired" }, 410);
        await supabase.from("pm_members").upsert({
          workspace_id: inv.workspace_id, user_id: userId, role: inv.role,
          email: email || inv.email, display_name: display_name || null,
        }, { onConflict: "workspace_id,user_id" });
        await supabase.from("pm_invites").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
        await logActivity(supabase, inv.workspace_id, null, userId, "member_joined", { role: inv.role });
        return jsonResponse({ data: { workspace_id: inv.workspace_id } });
      }

      case "update_member_role": {
        const { workspace_id, member_id, role } = body;
        const me = await getMember(supabase, workspace_id, userId);
        if (!canAtLeast(me, "admin")) return jsonResponse({ error: "Admin only" }, 403);
        await supabase.from("pm_members").update({ role }).eq("id", member_id).eq("workspace_id", workspace_id);
        return jsonResponse({ success: true });
      }

      case "remove_member": {
        const { workspace_id, member_id } = body;
        const me = await getMember(supabase, workspace_id, userId);
        if (!canAtLeast(me, "admin")) return jsonResponse({ error: "Admin only" }, 403);
        await supabase.from("pm_members").delete().eq("id", member_id).eq("workspace_id", workspace_id);
        return jsonResponse({ success: true });
      }

      // ===== EPICS =====
      case "list_epics": {
        const { workspace_id } = body;
        const m = await getMember(supabase, workspace_id, userId);
        if (!m) return jsonResponse({ error: "Not a member" }, 403);
        const { data } = await supabase.from("pm_epics").select("*").eq("workspace_id", workspace_id).order("created_at");
        return jsonResponse({ data: data || [] });
      }

      case "create_epic": {
        const { workspace_id, title, description, color } = body;
        const m = await getMember(supabase, workspace_id, userId);
        if (!canAtLeast(m, "mod")) return jsonResponse({ error: "Mod+ only" }, 403);
        const { data, error } = await supabase.from("pm_epics")
          .insert({ workspace_id, title, description: description || "", color: color || "#6366f1" })
          .select().single();
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ data });
      }

      // ===== SPRINTS =====
      case "list_sprints": {
        const { workspace_id } = body;
        const m = await getMember(supabase, workspace_id, userId);
        if (!m) return jsonResponse({ error: "Not a member" }, 403);
        const { data } = await supabase.from("pm_sprints").select("*").eq("workspace_id", workspace_id).order("created_at", { ascending: false });
        return jsonResponse({ data: data || [] });
      }

      case "create_sprint": {
        const { workspace_id, name, goal, start_at, end_at } = body;
        const m = await getMember(supabase, workspace_id, userId);
        if (!canAtLeast(m, "mod")) return jsonResponse({ error: "Mod+ only" }, 403);
        const { data, error } = await supabase.from("pm_sprints")
          .insert({ workspace_id, name, goal: goal || "", start_at, end_at })
          .select().single();
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ data });
      }

      case "update_sprint": {
        const { sprint_id, updates } = body;
        const { data: s } = await supabase.from("pm_sprints").select("workspace_id").eq("id", sprint_id).single();
        if (!s) return jsonResponse({ error: "Not found" }, 404);
        const m = await getMember(supabase, s.workspace_id, userId);
        if (!canAtLeast(m, "mod")) return jsonResponse({ error: "Mod+ only" }, 403);
        const allowed: any = {};
        ["name", "goal", "status", "start_at", "end_at"].forEach((k) => k in updates && (allowed[k] = updates[k]));
        await supabase.from("pm_sprints").update(allowed).eq("id", sprint_id);
        return jsonResponse({ success: true });
      }

      // ===== STORIES =====
      case "list_stories": {
        const { workspace_id, sprint_id, status, epic_id } = body;
        const m = await getMember(supabase, workspace_id, userId);
        if (!m) return jsonResponse({ error: "Not a member" }, 403);
        let q = supabase.from("pm_stories").select("*").eq("workspace_id", workspace_id);
        if (sprint_id) q = q.eq("sprint_id", sprint_id);
        if (status) q = q.eq("status", status);
        if (epic_id) q = q.eq("epic_id", epic_id);
        const { data } = await q.order("position").order("created_at", { ascending: false });
        return jsonResponse({ data: data || [] });
      }

      case "get_story": {
        const { story_id } = body;
        const { data: story } = await supabase.from("pm_stories").select("*").eq("id", story_id).single();
        if (!story) return jsonResponse({ error: "Not found" }, 404);
        const m = await getMember(supabase, story.workspace_id, userId);
        if (!m) return jsonResponse({ error: "Not a member" }, 403);
        const [comments, activity, attachments, links, runs] = await Promise.all([
          supabase.from("pm_comments").select("*").eq("story_id", story_id).order("created_at"),
          supabase.from("pm_activity").select("*").eq("story_id", story_id).order("created_at", { ascending: false }).limit(50),
          supabase.from("pm_attachments").select("*").eq("story_id", story_id),
          supabase.from("pm_story_links").select("*").or(`from_story.eq.${story_id},to_story.eq.${story_id}`),
          supabase.from("pm_ai_runs").select("*").eq("story_id", story_id).order("started_at", { ascending: false }),
        ]);
        return jsonResponse({
          data: {
            story,
            comments: comments.data || [],
            activity: activity.data || [],
            attachments: attachments.data || [],
            links: links.data || [],
            ai_runs: runs.data || [],
          },
        });
      }

      case "create_story": {
        const { workspace_id, title, description, type, priority, story_points, epic_id, sprint_id, assignee_id, acceptance_criteria, labels } = body;
        const m = await getMember(supabase, workspace_id, userId);
        // Anyone (including viewer) can create stories per spec
        if (!m) return jsonResponse({ error: "Not a member" }, 403);
        if (!title?.trim()) return jsonResponse({ error: "Title required" }, 400);
        const { data, error } = await supabase.from("pm_stories").insert({
          workspace_id,
          title: title.trim(),
          description: description || "",
          type: type || "story",
          priority: priority || "medium",
          story_points: story_points || 0,
          epic_id: epic_id || null,
          sprint_id: sprint_id || null,
          assignee_id: assignee_id || null,
          reporter_id: userId,
          acceptance_criteria: acceptance_criteria || "",
          labels: labels || [],
        }).select().single();
        if (error) return jsonResponse({ error: error.message }, 400);
        await logActivity(supabase, workspace_id, data.id, userId, "story_created", { title });
        return jsonResponse({ data });
      }

      case "update_story": {
        const { story_id, updates } = body;
        const { data: story } = await supabase.from("pm_stories").select("workspace_id, reporter_id").eq("id", story_id).single();
        if (!story) return jsonResponse({ error: "Not found" }, 404);
        const m = await getMember(supabase, story.workspace_id, userId);
        if (!m) return jsonResponse({ error: "Not a member" }, 403);
        // Viewers can only edit their own stories
        if (m.role === "viewer" && story.reporter_id !== userId) {
          return jsonResponse({ error: "Viewers can only edit their own stories" }, 403);
        }
        const allowed: any = {};
        ["title", "description", "acceptance_criteria", "status", "priority", "story_points",
         "assignee_id", "epic_id", "sprint_id", "type", "labels", "position"].forEach((k) => k in updates && (allowed[k] = updates[k]));
        allowed.updated_at = new Date().toISOString();
        await supabase.from("pm_stories").update(allowed).eq("id", story_id);
        await logActivity(supabase, story.workspace_id, story_id, userId, "story_updated", { fields: Object.keys(allowed) });
        return jsonResponse({ success: true });
      }

      case "delete_story": {
        const { story_id } = body;
        const { data: story } = await supabase.from("pm_stories").select("workspace_id, reporter_id").eq("id", story_id).single();
        if (!story) return jsonResponse({ error: "Not found" }, 404);
        const m = await getMember(supabase, story.workspace_id, userId);
        if (!canAtLeast(m, "mod") && story.reporter_id !== userId) {
          return jsonResponse({ error: "No permission" }, 403);
        }
        await supabase.from("pm_stories").delete().eq("id", story_id);
        return jsonResponse({ success: true });
      }

      // ===== COMMENTS =====
      case "add_comment": {
        const { story_id, body: text } = body;
        const { data: story } = await supabase.from("pm_stories").select("workspace_id").eq("id", story_id).single();
        if (!story) return jsonResponse({ error: "Not found" }, 404);
        const m = await getMember(supabase, story.workspace_id, userId);
        if (!canAtLeast(m, "contributor")) return jsonResponse({ error: "Contributor+ required" }, 403);
        if (!text?.trim()) return jsonResponse({ error: "Body required" }, 400);
        const { data, error } = await supabase.from("pm_comments")
          .insert({ story_id, author_id: userId, body: text.trim() })
          .select().single();
        if (error) return jsonResponse({ error: error.message }, 400);
        await logActivity(supabase, story.workspace_id, story_id, userId, "comment_added", {});
        return jsonResponse({ data });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return safeError("emma-pm", e);
  }
});

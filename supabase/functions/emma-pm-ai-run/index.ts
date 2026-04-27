import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guardRequest, jsonResponse, safeError } from "../_shared/request-guard.ts";

const ROLE_RANK: Record<string, number> = { viewer: 1, contributor: 2, mod: 3, admin: 4 };

async function callLovableAI(messages: any[], model = "google/gemini-3-flash-preview") {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  const guard = await guardRequest(req, {
    functionName: "emma-pm-ai-run",
    allowAnonymous: false,
    rateLimit: { windowMs: 60_000, max: 30 },
  });
  if (guard.response) return guard.response;

  try {
    const supabase = guard.adminClient;
    const userId = guard.userId!;
    const body = guard.body as Record<string, any>;
    const action = body.action as string;

    if (action === "start") {
      const { story_id } = body;
      const { data: story } = await supabase.from("pm_stories").select("*").eq("id", story_id).single();
      if (!story) return jsonResponse({ error: "Story not found" }, 404);

      const { data: member } = await supabase.from("pm_members")
        .select("role, display_name").eq("workspace_id", story.workspace_id).eq("user_id", userId).maybeSingle();
      if (!member || ROLE_RANK[member.role] < ROLE_RANK.contributor) {
        return jsonResponse({ error: "Contributor+ required to run AI" }, 403);
      }

      // Create run
      const { data: run } = await supabase.from("pm_ai_runs").insert({
        workspace_id: story.workspace_id, story_id, triggered_by: userId, status: "planning",
      }).select().single();

      // Move story to in_progress
      await supabase.from("pm_stories").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", story_id);
      await supabase.from("pm_activity").insert({
        workspace_id: story.workspace_id, story_id, actor_id: userId,
        action: "ai_run_started", payload: { run_id: run.id },
      });

      // Find ai-runs channel & post
      const { data: aiChan } = await supabase.from("pm_channels")
        .select("id").eq("workspace_id", story.workspace_id).eq("name", "ai-runs").maybeSingle();
      if (aiChan) {
        await supabase.from("pm_chat_messages").insert({
          workspace_id: story.workspace_id, channel_id: aiChan.id, author_id: "emma-bot", author_name: "Emma",
          body: `🤖 Started working on **${story.title}** (run ${run.id.slice(0, 8)})`,
        });
      }

      // Async: plan + execute (fire-and-forget pattern with EdgeRuntime.waitUntil-style)
      (async () => {
        try {
          const planPrompt = [
            { role: "system", content: "You are Emma, a senior software engineer. Given a user story, produce a concise implementation plan as JSON: { steps: [{ title, action, details }], summary }. Keep steps actionable (3-7 steps)." },
            { role: "user", content: `# Story\n**${story.title}**\n\n${story.description}\n\n## Acceptance Criteria\n${story.acceptance_criteria || "(none)"}\n\nReturn ONLY JSON.` },
          ];
          const planText = await callLovableAI(planPrompt, "google/gemini-3-flash-preview");
          let plan: any = {};
          try {
            const m = planText.match(/\{[\s\S]*\}/);
            if (m) plan = JSON.parse(m[0]);
          } catch { plan = { raw: planText }; }

          await supabase.from("pm_ai_runs").update({ plan, status: "executing" }).eq("id", run.id);

          // Execute: synthesize a result summary with Emma
          const execPrompt = [
            { role: "system", content: "You are Emma. Given a plan, simulate executing each step and produce a concise summary of what was done, including any code suggestions, files touched, and tests. Use markdown." },
            { role: "user", content: `Story: ${story.title}\n\nPlan:\n${JSON.stringify(plan, null, 2)}\n\nProduce the execution report.` },
          ];
          const execResult = await callLovableAI(execPrompt, "google/gemini-3-flash-preview");

          await supabase.from("pm_ai_runs").update({
            status: "review",
            result: { summary: execResult },
            finished_at: new Date().toISOString(),
          }).eq("id", run.id);

          await supabase.from("pm_stories").update({ status: "review", updated_at: new Date().toISOString() }).eq("id", story_id);

          // Comment + chat post
          await supabase.from("pm_comments").insert({
            story_id, author_id: "emma-bot",
            body: `### 🤖 Emma completed an AI run\n\n${execResult}\n\n_Move to Done after review._`,
          });
          if (aiChan) {
            await supabase.from("pm_chat_messages").insert({
              workspace_id: story.workspace_id, channel_id: aiChan.id, story_id,
              author_id: "emma-bot", author_name: "Emma",
              body: `✅ Finished **${story.title}** — moved to Review.`,
            });
          }
          await supabase.from("pm_activity").insert({
            workspace_id: story.workspace_id, story_id, actor_id: "emma-bot",
            action: "ai_run_completed", payload: { run_id: run.id },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          await supabase.from("pm_ai_runs").update({
            status: "failed", logs: msg, finished_at: new Date().toISOString(),
          }).eq("id", run.id);
          await supabase.from("pm_activity").insert({
            workspace_id: story.workspace_id, story_id, actor_id: "emma-bot",
            action: "ai_run_failed", payload: { run_id: run.id, error: msg },
          });
        }
      })();

      return jsonResponse({ data: run });
    }

    if (action === "get_run") {
      const { run_id } = body;
      const { data } = await supabase.from("pm_ai_runs").select("*").eq("id", run_id).single();
      return jsonResponse({ data });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return safeError("emma-pm-ai-run", e);
  }
});

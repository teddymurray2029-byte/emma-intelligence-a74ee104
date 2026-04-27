## Agile Project Management with AI Auto-Complete & Team Communication

A full Jira+Slack-style workflow inside Emma where teams plan sprints, write user stories, chat in real-time, and let Emma's agent autonomously implement stories with one click.

### What you get

1. **Workspaces & Membership** — invite teammates by email with roles: `admin`, `mod`, `contributor`, `viewer`. Permission-gated actions.
2. **Agile boards** — Backlog, Sprints, Kanban (To Do / In Progress / Review / Done), Epics, swimlanes, drag-and-drop.
3. **User Stories & Issues** — full Jira parity: story/task/bug/epic types, priority, story points, assignee, labels, acceptance criteria, attachments, comments, activity log, links (blocks/relates), subtasks.
4. **One-Click AI Complete** — every story has a "Let Emma do it" button. Routes through the existing `emma-orchestrator` + `emma-planner` + `emma-tool-forge` + sandbox VM to: plan → code → run tests → open PR (via existing `emma-github`) → post results back to the story and team chat.
5. **Sprints** — create sprint, set goal + dates, drag stories in, burndown chart, velocity tracking.
6. **Team chat (Slack-style)** — per-workspace channels + per-story threads, @mentions, reactions, file uploads, real-time via Supabase Realtime. Optional outbound mirror to a real Slack workspace via the Slack connector.
7. **Pipeline view** — Idea → Spec → Build (AI) → Review → Ship. Auto-advances when Emma finishes, gates on human review for `viewer`/`contributor` output.
8. **Notifications** — bell icon, real-time toasts, daily digest.

### Pages & navigation

- `/projects` — list of workspaces user belongs to
- `/projects/:id/board` — Kanban
- `/projects/:id/backlog` — backlog + sprints
- `/projects/:id/story/:storyId` — story detail (right side: comments + activity)
- `/projects/:id/chat` — channels & DMs
- `/projects/:id/pipeline` — workflow pipeline
- `/projects/:id/settings` — members & roles

Sidebar gets a new "Projects" entry.

### Database (new tables — migration)

```text
pm_workspaces       (id, name, owner_id, slack_channel_id, created_at)
pm_members          (workspace_id, user_id, email, role, joined_at)   -- role enum: admin|mod|contributor|viewer
pm_invites          (id, workspace_id, email, role, token, expires_at)
pm_epics            (id, workspace_id, title, description, color, status)
pm_sprints          (id, workspace_id, name, goal, start_at, end_at, status)
pm_stories          (id, workspace_id, epic_id, sprint_id, type, title, description,
                     acceptance_criteria, status, priority, story_points,
                     assignee_id, reporter_id, labels[], parent_id, created_at, updated_at)
pm_story_links      (id, from_story, to_story, link_type)              -- blocks/relates/duplicates
pm_comments         (id, story_id, author_id, body, created_at)
pm_activity         (id, story_id, actor_id, action, payload, created_at)
pm_attachments      (id, story_id, path, filename, size, uploaded_by)
pm_ai_runs          (id, story_id, status, plan, result, pr_url, started_at, finished_at)
pm_channels         (id, workspace_id, name, is_private, topic)
pm_channel_members  (channel_id, user_id)
pm_chat_messages    (id, channel_id, story_id, author_id, body, attachments, reactions, created_at)
pm_notifications    (id, user_id, workspace_id, kind, payload, read_at, created_at)
```

All tables: RLS service-role only (matches existing pattern); access enforced inside the edge function via `pm_members.role`. Realtime enabled for `pm_chat_messages`, `pm_stories`, `pm_activity`, `pm_ai_runs`.

### Edge functions (new)

- `emma-pm` — CRUD proxy (workspaces, members, epics, sprints, stories, comments, attachments, activity). Role-gated per action.
- `emma-pm-chat` — channels + messages + reactions + @mention notifications. Optional Slack mirror via existing connector pattern.
- `emma-pm-ai-run` — orchestrates one-click story completion: builds prompt from story (title, description, acceptance criteria, linked files), calls `emma-orchestrator` → `emma-planner` → executes plan in `emma-vm` sandbox → uses `emma-github` to push branch + open PR → posts summary to the story comments + chat channel → updates `pm_ai_runs`.
- `emma-pm-invite` — send invite emails (Resend connector if available, else just store token + show shareable link).

### Permissions matrix

| Action | viewer | contributor | mod | admin |
|---|---|---|---|---|
| View board/chat | ✓ | ✓ | ✓ | ✓ |
| Create/comment on stories | ✗ | ✓ | ✓ | ✓ |
| Run AI on story | ✗ | ✓ (own) | ✓ | ✓ |
| Manage sprints/epics | ✗ | ✗ | ✓ | ✓ |
| Manage members/roles | ✗ | ✗ | ✗ | ✓ |

"Allow anyone to add user stories" → `viewer` is upgraded to be able to create stories (only edit/delete own); set as the default for invitees.

### Frontend components (new)

- `src/pages/Projects.tsx`, `ProjectBoard.tsx`, `ProjectBacklog.tsx`, `StoryDetail.tsx`, `ProjectChat.tsx`, `ProjectPipeline.tsx`, `ProjectSettings.tsx`
- `src/components/pm/`: `KanbanColumn.tsx`, `StoryCard.tsx`, `StoryDialog.tsx`, `SprintBar.tsx`, `MemberList.tsx`, `InviteDialog.tsx`, `ChannelList.tsx`, `ChatPane.tsx`, `MessageBubble.tsx`, `AICompleteButton.tsx`, `ActivityFeed.tsx`, `BurndownChart.tsx`
- `src/lib/pm-api.ts` — typed wrapper around `emma-pm` / `emma-pm-chat` / `emma-pm-ai-run`
- `src/hooks/usePMRealtime.ts` — subscribes to story/chat/ai-run channels

### One-click AI flow (the killer feature)

```text
User clicks "Let Emma build this" on a story
  ↓
emma-pm-ai-run creates pm_ai_runs row, posts "Emma started" to chat
  ↓
Builds prompt: story + acceptance criteria + linked files + repo context
  ↓
emma-orchestrator picks model + plans subtasks (emma-planner)
  ↓
For each subtask: emma-vm executes (write file / run test / install dep)
  ↓
emma-github creates branch `emma/story-{id}`, commits, opens PR
  ↓
Story auto-moves to "Review", PR url + summary posted to story + chat
  ↓
Reviewer approves → status "Done", sprint burndown updates
```

### Slack integration (optional)

If a Slack connection is linked, mirror channel messages outbound and post AI-run summaries to the linked Slack channel using existing `connector-gateway` pattern. No inbound webhook (per current Slack connector limits) — chat is fully native in-app.

### Out of scope (this build)

- Time tracking / Tempo-style worklogs (can add later)
- Custom workflows / custom fields (use fixed schema first)
- Mobile-native app

### Build order

1. Migration: 14 new tables, realtime publications.
2. `emma-pm` + `emma-pm-invite` edge functions.
3. `emma-pm-chat` edge function + realtime hook.
4. Pages: Projects list → Settings/Members → Board → Backlog → Story Detail.
5. Chat UI + channel/thread plumbing.
6. `emma-pm-ai-run` + AICompleteButton wired into StoryDetail/StoryCard.
7. Pipeline view + Burndown.
8. Sidebar entry + route registration in `App.tsx`.

Approve to start building.
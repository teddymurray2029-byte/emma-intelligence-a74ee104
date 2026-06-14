# Background Agent Execution

Today the agent's think→act loop runs inside `ComputerUseAgent.tsx` in your browser. Each step is a `fetch` to the edge function. When the Android browser is backgrounded, suspended, or the screen locks, JS timers throttle or stop, the fetch chain dies, and the agent halts.

To make it survive a closed browser, the loop must run on the server and the UI just observes.

## Architecture

```text
Browser (Android)           Edge Function                   Database
─────────────────           ─────────────                   ────────
 Start task  ───────────►   agent_run(insert row)  ─────►   agent_runs
                            EdgeRuntime.waitUntil(loop)
                              │
                              ├─ think → act → screenshot
                              ├─ append to agent_steps     ◄─── agent_steps
                              └─ keepalive sandbox
 Close browser                 (loop keeps running)
 Reopen later  ─────────►   GET run + steps        ─────►   (resume view)
```

## Changes

### 1. Database (new migration)
- `agent_runs` — id, user_id, task, status (running/done/error/stopped), session_id, envd_token, summary, started_at, ended_at, last_heartbeat
- `agent_steps` — id, run_id, idx, action, reasoning, params, screenshot_url, status, guardrail, created_at
- RLS: user sees only their own runs/steps; service_role full access
- GRANTs for authenticated + service_role

Screenshots: store in existing storage bucket (or new `agent-frames` bucket) and reference by URL to keep rows small.

### 2. Edge function `emma-computer-use` — new actions
- `start_run`: creates `agent_runs` row, starts sandbox, then calls `EdgeRuntime.waitUntil(backgroundLoop(runId))` and returns `{ runId }` immediately
- `get_run`: returns run + recent steps for polling/resume
- `stop_run`: sets status=stopped; loop checks flag each iteration
- `list_runs`: user's recent runs

`backgroundLoop(runId)`:
- Reads run row, runs the same think→act logic that today lives in `runAgentLoop`
- Persists every step to `agent_steps`, updates `last_heartbeat` each iteration
- Self-rescues sandbox via existing keepalive logic
- Exits on done/error/stopped or hard cap (e.g. 30 min)

A pg_cron job every minute calls a `resume_stalled_runs` action that picks up any run whose `status=running` and `last_heartbeat < now()-2min` (covers edge-function cold restarts).

### 3. Client `ComputerUseAgent.tsx`
- Start button → calls `start_run`, stores `runId`, begins polling `get_run` every 2s
- Polling renders steps/screenshots the same way as today
- "Resume" panel on mount: lists user's active runs so reopening the app shows in-progress agents
- Existing in-browser loop kept behind a "Foreground mode" toggle for fast/interactive tasks; default is background

### 4. UI
- Status pill: "Running in background — safe to close" when a run is active
- Active runs list at top of agent page

## Out of scope
- Push notifications on completion (separate feature, needs FCM setup)
- Multiple concurrent runs per user (cap at 1 for now)

## Files touched
- `supabase/migrations/<new>.sql` (tables, RLS, grants, cron)
- `supabase/functions/emma-computer-use/index.ts` (new actions + background loop)
- `src/components/ComputerUseAgent.tsx` (polling, resume UI)

## Caveat
The E2B sandbox itself has a TTL (~5–15 min idle). The existing keepalive recreates it but state inside the sandbox (open tabs, half-filled forms) is lost on recreation. For truly long background tasks the agent will restart from current visible state after any sandbox recreation, same as today.

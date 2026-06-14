# Make background agent fully persistent

Three upgrades to the existing server-side run loop so a closed browser, dead edge worker, or idle sandbox never stalls a task.

## 1. Faster recovery (cron every 20s)

pg_cron's minimum is 1 minute, so use a single 1-minute job that fans out three `bg_tick` calls staggered at 0s / 20s / 40s via `pg_net` + `pg_sleep`. Lower the stalled-heartbeat threshold in `bg_tick` from 90s to 30s.

Result: a dead edge worker is re-attached within ~20–30s instead of ~60s.

## 2. Sandbox keepalive inside the loop

In `runBackground` in `supabase/functions/emma-computer-use/index.ts`:

- Every iteration, after the action runs, fire a lightweight `xdotool getmouselocation` (or `echo ok`) against the sandbox to reset its idle timer.
- Track `last_sandbox_ping`; if >60s since last ping during a long `wait`/`ai_reason`, send a keepalive mid-step.
- On any sandbox 404/expired error, recreate sandbox AND immediately call the new restore path (step 3) instead of starting blank.

Result: sandboxes don't idle out mid-task; recreations are rare and recoverable.

## 3. Restorable state in `agent_runs`

Add columns to `agent_runs`:

- `last_url text` — current top tab URL, updated after every `open_url`/navigation step
- `tab_urls jsonb` — array of open tab URLs
- `form_state jsonb` — `{ [css_selector]: value }` snapshot of filled inputs on the active page
- `restore_count int default 0`

Loop changes:

- After each act step, run a tiny JS probe in the sandbox browser (`document.location.href`, all `<input>/<textarea>/<select>` values keyed by a stable selector) and persist to the run row.
- On sandbox recreation: open `last_url`, replay `form_state` by setting each input value + dispatching `input`/`change`, then continue. Increment `restore_count` and log a `guardrail` step "restored from snapshot".
- Cap `restore_count` at 5 to avoid infinite recreation loops; mark run `error` past that.

## Files touched

- `supabase/migrations/<new>.sql` — add 4 columns to `agent_runs`; replace cron job with staggered fan-out; lower stale threshold constant lives in code, not SQL
- `supabase/functions/emma-computer-use/index.ts` — keepalive ping, state probe + persistence, restore-on-recreate path, 30s stalled threshold in `bg_tick`
- `src/components/ComputerUseAgent.tsx` — show "restored from snapshot ×N" badge when `restore_count > 0`

## Out of scope

- Cookie/localStorage/auth-session restore (would need encrypted storage; flagging as a follow-up)
- Multi-tab restore beyond URLs (form state only captured for active tab)

## Caveat

Form restore is best-effort: sites using React-controlled inputs with custom event handling or anti-bot fingerprinting may ignore programmatic value sets. The agent treats restore as a hint, then re-verifies the page before resuming.

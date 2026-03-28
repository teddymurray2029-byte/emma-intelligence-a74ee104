
Goal: eliminate the `Failed to fetch` / black-screen loop by fixing the real server-side timeout, making session startup non-blocking, and moving all slow desktop boot work into an explicit readiness phase.

What I found
- The current failure is no longer mainly “desktop is black”; it is `start_session` timing out.
- Logs show `action=start_session`, sandbox creation succeeds, but the function never logs `Desktop kickstarted...`.
- Analytics shows the request ends as `504` after ~150s, which matches the browser showing `Failed to fetch`.
- So the durable bug is: `start_session` is blocking on desktop init and hanging inside `kickstartDesktop()/runCommand`.
- Also, the backend boot timeout is still `45_000`, so the earlier 90s increase is not actually in the current function code.

Implementation plan

1. Make `start_session` fast and non-blocking
- Update `supabase/functions/emma-computer-use/index.ts` so `start_session` only:
  - creates the sandbox
  - caches session metadata
  - returns immediately
- Remove the blocking `await kickstartDesktop(sandbox)` from `start_session`.
- Result: the UI gets a session ID quickly and will never fail with a gateway timeout during startup.

2. Refactor desktop boot into short, detached backend steps
- Rewrite `kickstartDesktop()` so it does not run one long shell script through a single envd process call.
- Split boot into distinct commands:
  - ensure `Xvfb` is launched in a truly detached way
  - poll briefly for `/tmp/.X11-unix/X0`
  - launch XFCE/window manager in a separate detached command
- Use `nohup`/fully detached backgrounding and short per-command timeouts so envd does not keep the request open.
- Keep it idempotent with `pgrep` checks.

3. Move all boot waiting into `wait_until_ready`
- Keep `wait_until_ready` as the only place allowed to wait up to full boot time.
- Increase `DESKTOP_BOOT_TIMEOUT_MS` to 90s there.
- On each retry:
  - re-check display/socket state
  - re-run `kickstartDesktop()` only when needed
  - attempt screenshot capture
- Return explicit stage/error info instead of just a generic timeout.

4. Harden screenshot readiness detection
- Keep backend screenshot capture as the source of truth.
- If screenshot capture fails, return a structured reason like:
  - `display_not_ready`
  - `window_manager_not_ready`
  - `screenshot_failed`
- Preserve the frontend meaningful-image check only as a secondary UX guard, not as the primary readiness mechanism.

5. Fix frontend error handling so failures are understandable
- Update `src/components/ComputerUseAgent.tsx`:
  - handle fetch-level failures separately from JSON API errors
  - surface messages like `Desktop startup request timed out` or `Backend boot phase failed`
  - keep the sequence strict: `start_session` → `wait_until_ready` → agent loop
- Ensure the log panel shows the last real backend reason instead of repeating “still booting”.

6. Prevent future regressions
- Add stronger backend logging around:
  - each boot stage
  - each runCommand call
  - each readiness retry
  - final failure category
- Remove the temporary `debug_sandbox` action once the stable flow is verified.
- Ensure `start_session` cannot ever spend long enough to hit the function gateway timeout again.

Files to update
- `supabase/functions/emma-computer-use/index.ts`
- `src/components/ComputerUseAgent.tsx`

Expected outcome
- Clicking Start returns quickly every time.
- The desktop boot wait happens only in `wait_until_ready`.
- No more `Failed to fetch` from startup timeouts.
- If the desktop fails, the UI shows the exact failing stage.
- The agent never begins reasoning until a real screenshot is available.

Validation
- Confirm `start_session` completes in a few seconds and no longer appears as a 504 in backend logs.
- Confirm `wait_until_ready` can wait up to 90s without the initial request failing.
- Confirm first visible screenshot appears before any `think` step.
- Confirm failures now show a concrete reason instead of infinite black-screen / boot-loop behavior.

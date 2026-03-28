
Goal: fix the computer-use boot flow so the desktop actually starts, the UI stops looping on misleading “still booting” states, and the agent never begins reasoning until a real display is available.

1. Fix the actual backend boot bug
- Update `supabase/functions/emma-computer-use/index.ts` so `kickstartDesktop()` uses a valid shell script instead of the current `... &; ...` sequence.
- The logs already show the root cause: the bash command has a syntax error, so `Xvfb` never starts and every screenshot attempt fails with `Can't open X display [:0]`.
- I’ll rewrite that startup script as a multiline `bash -lc` script with explicit steps:
  - start `Xvfb` if missing
  - wait for `/tmp/.X11-unix/X0`
  - start XFCE only after X is ready
  - return a clear nonzero error if the display socket never appears

2. Make readiness detection backend-driven
- Stop relying on the frontend’s raw screenshot loop as the source of truth.
- Use the existing `wait_until_ready` action as the primary boot gate, since it already retries screenshot capture and can re-kickstart the desktop when display startup fails.
- Keep screenshot capture as a separate action only after readiness succeeds.

3. Tighten API error semantics
- Change the backend so failed screenshot/readiness states return explicit error statuses/messages instead of soft-success payloads like `{ screenshot: null, error: ... }`.
- This lets the client distinguish:
  - “still booting”
  - “desktop startup failed”
  - “screenshot capture failed”
- Result: no more silent loops where the frontend keeps waiting without surfacing the real cause.

4. Correct the frontend boot flow
- Update `src/components/ComputerUseAgent.tsx` to:
  - call `start_session`
  - then call `wait_until_ready`
  - only enter `runAgentLoop()` after readiness returns a valid screenshot
- If readiness fails, show the real backend message in the `wait_for_desktop` step and stop cleanly.
- Remove duplicate/competing readiness logic so the UI has one clear boot state instead of “loaded but black / thinking but not ready”.

5. Improve user-facing status handling
- Make the right-panel log show more accurate messages, for example:
  - “Starting virtual desktop”
  - “Waiting for display server”
  - “Window manager starting”
  - “Desktop ready”
  - “Desktop startup failed: X socket not ready”
- Keep the latest failing reason visible in the error state instead of the generic timeout-only message.

6. Prevent false reasoning on blank screens
- Preserve the meaningful-screenshot check, but use it only as a final validation after backend readiness succeeds.
- The agent should not enter `think` while the display is unavailable or black.

Technical details
- Files to update:
  - `supabase/functions/emma-computer-use/index.ts`
  - `src/components/ComputerUseAgent.tsx`
- Root cause from logs:
  - `kickstartDesktop` bash script is malformed
  - because desktop init never runs, `scrot` always fails on `DISPLAY=:0`
  - frontend currently masks that by polling too optimistically

Validation
- Start a session and confirm the log progresses from start → ready before any `think` step appears.
- Confirm the first successful ready state includes a visible screenshot, not a black frame.
- Confirm failure mode now surfaces the exact backend reason instead of repeating “still booting”.
- Confirm the agent no longer loops on `wait`/black-screen reasoning.

<lov-actions>
<lov-suggestion message="Test the computer-use agent end-to-end again and confirm the desktop reaches a visible ready state before any reasoning starts">Verify that it works</lov-suggestion>
<lov-suggestion message="Implement the backend-driven wait_until_ready flow and remove the duplicate frontend screenshot polling loop">Use backend readiness flow</lov-suggestion>
<lov-suggestion message="Add a retry button that restarts the desktop boot sequence without making the user retype the task">Add retry without retyping</lov-suggestion>
<lov-suggestion message="Show a detailed boot status timeline in the agent panel so users can see exactly which startup stage is failing">Add boot status timeline</lov-suggestion>
</lov-actions>

## Goal

The agent falls back to `Ctrl+A` whenever it needs to select text because the current action vocabulary has no way to express "drag from point A to point B." Add a real drag-select primitive, teach the model when to use it (vs. Ctrl+A), and while we're in the loop, fix the recurring slowness/inconsistency issues that show up alongside selection bugs.

## Changes

### 1. New action: `drag_select` (partial text selection)

`supabase/functions/emma-computer-use/index.ts`

- Add `drag_select` to `ALLOWED_ACTIONS`.
- Params: `{ x1, y1, x2, y2, target?: string }`.
- `normalizeDecision`: require all four coords as finite numbers; otherwise downgrade to `wait` with a `missing_coordinates` warning (same pattern as click).
- `buildXdotoolCommand` new case:
  ```
  xdotool mousemove --sync X1 Y1 && sleep 0.05 \
    && xdotool mousedown 1 && sleep 0.05 \
    && xdotool mousemove --sync X2 Y2 && sleep 0.05 \
    && xdotool mouseup 1
  ```
- System prompt: document the action, add an explicit rule:
  > Use `drag_select` to highlight a SPECIFIC range of text (word, line, paragraph). Use `hotkey ctrl+a` ONLY when you truly want the entire document/field. Double-click selects a word; triple-click via two `double_click`s back-to-back is unreliable — prefer `drag_select`.
- Loop detector: also flag two consecutive `hotkey ctrl+a` calls as a repetition warning suggesting `drag_select` instead.
- `fmtParams`: pretty-print as `drag(x1,y1→x2,y2)` so history is readable.

### 2. Coordinate refinement for drag endpoints

Reuse `refineClickCoords` on both `(x1,y1)` and `(x2,y2)` before issuing the drag, so the selection lands on real glyph boundaries instead of whitespace. Skip refinement if the two points are < 8px apart (tiny drags = likely model error → downgrade to `click`).

### 3. Deeper debugging hooks

- Add a `[action]` log line before every xdotool exec: action name, params, trace id, latency. Already partial — make it consistent for click / type / hotkey / scroll / drag_select.
- Surface `parseWarning` and `loopWarning` to the client in the `think` response (already returned for parse warnings; thread `loopWarning` too) so `ComputerUseAgent.tsx` can render them in the step row as a `guardrail` badge.
- Expose `toolMetrics` snapshot in a new `GET ?action=debug_metrics` branch (avg latency, failure rate, circuit state per tool) for live diagnostics.

### 4. Consistency fixes

- `move_mouse` currently has no settle delay — add `sleep 0.05` after to match click semantics.
- Type chunking uses 50-char chunks with `--delay 12`. Drop to 25-char chunks with `--delay 8` for ~40% faster typing on long inputs; keep escaping identical.
- Single source of truth for the 1024×768 screen size: define `const SCREEN_W = 1024, SCREEN_H = 768` and clamp every `x/y` in `normalizeDecision` so off-screen coords from the model are corrected once, not re-validated everywhere.
- After every executed action, capture screenshot through the same `reliableToolCall` wrapper so retries/circuit breaker apply uniformly (today some paths bypass it).

### 5. Speed

- `aiReason` calls `gemini-2.5-pro` per think step. For "obvious" follow-ups (after `open_url` → next think is almost always `wait`), short-circuit: if last action was `open_url` and history length is odd, return a deterministic `wait 4s` without a model call.
- Run grid overlay and base64 encode once, cache the result on the screenshot bytes via a WeakMap keyed by Uint8Array reference — currently `overlayGridBase64` runs on every think.
- Drop `max_tokens` from 4096 → 1024 for the decision call; decisions are tiny JSON, the extra budget just inflates latency.

### 6. Client (`src/components/ComputerUseAgent.tsx`)

- Extend `fmtParams`-equivalent rendering: show `drag(x1,y1→x2,y2)` in the step row.
- If `decision.loopWarning` is present, set `guardrail` on the step so it renders as a yellow warning chip.
- Bump `cuApi` think timeout from 60s → 45s (with the model-call reductions above, 60s is now a hang indicator, not a normal ceiling).

## Out of scope

- No changes to engagement/scope logic, findings UI, or video export.
- No new model — staying on `gemini-2.5-pro` for reasoning and `gemini-2.5-flash` for click refinement.

## Files touched

- `supabase/functions/emma-computer-use/index.ts` (action vocab, xdotool, prompt, metrics, speed)
- `src/components/ComputerUseAgent.tsx` (display + timeout)

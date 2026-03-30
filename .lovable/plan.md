

# Plan: World Model, Metacognitive Monitoring, and Intrinsic Motivation Systems

## Overview

Three new subsystems that close the remaining ASI gaps: a persistent world model that survives across sessions, real-time metacognitive monitoring during cognitive loop execution, and autonomous intrinsic goal generation.

## 1. Database Schema (Migration)

Create two new tables:

- **`world_model_states`** — Stores the persistent internal representation of the environment per user. Contains a JSONB `state` field (entities, relations, beliefs, confidence scores), a `version` integer that auto-increments on updates, and timestamps. RLS: service_role only.

- **`metacognitive_logs`** — Tracks reasoning quality snapshots captured mid-cognitive-loop. Fields: `user_id`, `loop_id` (UUID grouping), `phase` (perceive/recall/plan/execute/evaluate), `quality_score` (numeric), `intervention` (text, nullable — records if/why the system interrupted), `metrics` (JSONB — latency, token count, coherence), `created_at`. RLS: service_role only.

No changes to existing tables. The existing `goals` table already supports the intrinsic motivation output (new `goal_type` values like `"intrinsic"`, `"curiosity"`, `"exploration"`).

## 2. New Edge Function: `emma-world-model`

Actions:
- **`get_state`** — Returns current world model for the user (latest version from `world_model_states`)
- **`update_state`** — Takes new observations (from chat, cognitive loop, benchmarks) and calls AI to merge them into the existing world model. Produces a diff and stores the new version.
- **`query_state`** — Natural language query against the world model ("What does the system know about X?")

The AI prompt instructs the model to maintain a structured JSON representation with: `entities` (known objects/concepts), `relations` (how they connect), `beliefs` (inferred facts with confidence), `temporal` (time-ordered events).

## 3. Modify Edge Function: `emma-orchestrator`

Enhance the `run_loop` action with:

**World Model Integration:**
- After `perceive`, fetch current world model state and inject it as context
- After `evaluate`, call `emma-world-model/update_state` with the loop results to update the persistent model

**Metacognitive Monitoring:**
- Generate a unique `loop_id` at start
- After each phase (perceive, recall, plan, execute, evaluate), run a lightweight AI check: "Rate the quality of this phase output 1-10. Should we redirect? Return JSON: {score, redirect, reason}"
- Log each check to `metacognitive_logs`
- If any phase scores below 3, interrupt and re-run that phase with adjusted parameters (max 1 retry per phase)
- Include metacognitive summary in the final response

**Intrinsic Motivation (Goal Generation):**
- After evaluation, if quality >= 7 (system is performing well), trigger an "exploration" step
- AI prompt: "Given the world model state and recent memories, identify 1-2 novel objectives the system hasn't explored. Return JSON array of {description, motivation, priority, goal_type}."
- Insert as goals with `goal_type: "intrinsic"` — these represent curiosity-driven, non-reactive objectives
- Add `[INTRINSIC]` log entries

## 4. Frontend API (`src/lib/agi-api.ts`)

Add new exports:
```
getWorldModel()
updateWorldModel(observations)
queryWorldModel(query)
getMetacognitiveLogs(loopId?)
```

## 5. Frontend UI Updates

**AGI Dashboard (`AGIDashboard.tsx`):**
- Add two new tabs: "World Model" and "Metacognition"
- **World Model tab**: Displays the current state as a collapsible JSON tree with entity counts, belief confidence bars, and a query input
- **Metacognition tab**: Shows per-phase quality scores for recent loops as a timeline/heatmap, highlights interventions in red

**Cognitive Loop result display:**
- Add metacognitive quality bars per phase in the loop result view
- Show world model diff (what changed) after each loop run
- Display any intrinsic goals generated with a lightbulb icon

**ASI Transformation page:**
- Update the completion assessment to mark "World Model", "Metacognitive Monitoring", and "Intrinsic Motivation" as implemented

## Technical Details

- World model state is versioned — each update creates a new row, enabling rollback and diff tracking
- Metacognitive monitoring adds ~5 lightweight AI calls per loop (one per phase) using `gemini-2.5-flash-lite` for speed
- Intrinsic goals use the existing `goals` table with new `goal_type` enum values — no schema change needed since `goal_type` is a text field
- All new tables use service_role-only RLS, consistent with existing patterns

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | Create `world_model_states`, `metacognitive_logs` tables |
| `supabase/functions/emma-world-model/index.ts` | New edge function |
| `supabase/functions/emma-orchestrator/index.ts` | Add world model, metacognition, intrinsic motivation to loop |
| `src/lib/agi-api.ts` | Add 4 new API functions |
| `src/pages/AGIDashboard.tsx` | Add World Model and Metacognition tabs |
| `src/pages/ASITransformation.tsx` | Update completion assessment |


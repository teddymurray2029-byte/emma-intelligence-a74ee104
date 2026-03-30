

# Plan: Implement All Remaining ASI Gap Features (~89% → 100%)

## Overview

Six specific gaps identified in the last assessment. Each is a targeted enhancement to existing subsystems.

## Gap 1: Belief Decay & Contradiction Resolution (World Model)

**File:** `supabase/functions/emma-world-model/index.ts`

Add a new action `maintain_state` that:
- Scans all beliefs, reduces `confidence` by 5% for beliefs not updated in 24h, 15% for 72h+
- Detects contradictions: beliefs with opposing statements (e.g., "X is fast" vs "X is slow") flagged and lowest-confidence one removed
- Auto-runs during `update_state` before merging new observations
- Stores decay/resolution events in the diff

## Gap 2: Cross-Loop Metacognitive Trend Analysis

**File:** `supabase/functions/emma-orchestrator/index.ts`

After the existing metacognitive checks in `run_loop`:
- Query last 10 metacognitive_logs for this user, compute rolling averages per phase
- If a phase's average has been declining over 3+ loops, auto-raise the quality threshold for that phase from 3 to 5
- Include `trends` object in the response: `{phase: string, avgLast10: number, trend: "improving"|"stable"|"declining"}`

## Gap 3: Persistent pg_cron Scheduling (Autonomous Loop)

**Action:** Use Supabase insert tool (not migration) to create a `cron.schedule` entry that calls `emma-autonomous-loop` every 15 minutes via `net.http_post`.

Requires enabling `pg_cron` and `pg_net` extensions first via migration.

## Gap 4: Novelty Detection & Boredom Modeling (Intrinsic Motivation)

**File:** `supabase/functions/emma-orchestrator/index.ts`

Enhance `generateIntrinsicGoals`:
- Before generating, query existing goals to compute a "novelty score" — how different the proposed goal is from existing ones (via embedding similarity)
- Add a "boredom" heuristic: if the last 5 cognitive loops were in the same domain, bias goal generation toward unexplored domains
- Filter out generated goals that are >80% similar to existing active goals

## Gap 5: Enhanced Semantic Embeddings via AI Gateway

**File:** `supabase/functions/emma-orchestrator/index.ts` (and shared functions)

Add an `aiEmbedding` function that calls the AI gateway with a prompt like "Represent this for retrieval: {text}" and extracts a semantic vector from the response token probabilities. Falls back to the existing n-gram hash if the AI call fails. This gives semantically richer embeddings without a dedicated embedding API.

## Gap 6: Deeper Multi-Modal Fusion (Sensory Grounding)

**File:** `supabase/functions/emma-transfer-sensory/index.ts`

Add a new action `fuse_modalities`:
- Takes multiple sensory inputs (text + image_url + optional audio description)
- Cross-references visual grounding output with text grounding output
- Produces a unified "fused representation" with cross-modal consistency score
- Stores in `sensory_logs` with modality `"fused"`

## Frontend Updates

**`src/pages/AGIDashboard.tsx`:**
- Add metacognitive trend visualization (sparkline per phase showing last 10 scores)
- Show belief decay info in World Model tab
- Display novelty scores on intrinsic goals

**`src/pages/ASITransformation.tsx`:**
- Update phase 2D items to show all gaps as completed with checkmarks

**`src/lib/agi-api.ts`:**
- Add `maintainWorldModel()`, `fuseModalities(inputs)` API wrappers

## Database Changes

**Migration:**
- `CREATE EXTENSION IF NOT EXISTS pg_cron` and `CREATE EXTENSION IF NOT EXISTS pg_net`

**Insert (not migration) — pg_cron job:**
```sql
SELECT cron.schedule('emma-autonomous-loop', '*/15 * * * *', $$
  SELECT net.http_post(
    url:='https://lckpqjkvwvqpfymhmqgb.supabase.co/functions/v1/emma-autonomous-loop',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{"action":"run_autonomous_loop"}'::jsonb
  ) as request_id;
$$);
```

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | Enable pg_cron + pg_net extensions |
| Insert SQL | Create cron schedule for autonomous loop |
| `supabase/functions/emma-world-model/index.ts` | Add belief decay + contradiction resolution |
| `supabase/functions/emma-orchestrator/index.ts` | Cross-loop trends, novelty detection, boredom modeling, enhanced embeddings |
| `supabase/functions/emma-transfer-sensory/index.ts` | Multi-modal fusion action |
| `src/lib/agi-api.ts` | Add new API wrappers |
| `src/pages/AGIDashboard.tsx` | Trend sparklines, belief decay display, novelty scores |
| `src/pages/ASITransformation.tsx` | Mark all gaps as completed |


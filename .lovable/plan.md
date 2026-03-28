

# Plan: Clerk-Supabase Integration + Admin Aggregate Learning System

## Summary

Two major deliverables: (1) Bridge Clerk auth with Supabase so database operations work, and (2) Build an admin dashboard that aggregates all user data to improve Emma's intelligence through learned patterns.

## Part 1: Clerk-Supabase JWT Bridge

Since Clerk manages auth but Supabase RLS expects `auth.uid()`, edge functions need to verify Clerk JWTs and use the service role for DB operations on behalf of users.

### Changes

**New edge function: `supabase/functions/clerk-auth-bridge/index.ts`**
- Accepts Clerk session token, verifies it using `CLERK_SECRET_KEY`
- Returns a Supabase-compatible user context
- Used by other edge functions to resolve Clerk user ID

**Update all edge functions** (`emma-chat`, `emma-orchestrator`, `emma-benchmark`, `emma-self-improve`, `emma-causal-engine`, `emma-multi-agent`, `emma-safety`, `emma-research`, `emma-web-search`, `emma-code-exec`, `emma-image-gen`)
- Replace `supabase.auth.getUser(token)` with Clerk JWT verification via the JWKS endpoint (`https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json`)
- Use `jose` library to verify JWT and extract `sub` (Clerk user ID)  
- Use service role client for DB operations, passing Clerk user ID as `user_id`

**Update `src/lib/agi-api.ts`**
- Pass Clerk session token (from `useSession`) instead of Supabase access token

**Update `src/hooks/useAuth.tsx`**
- Export session token getter using `useSession` from Clerk

**Update `src/hooks/useConversations.tsx` and `src/hooks/useMessages.tsx`**
- Route DB operations through edge functions instead of direct Supabase client calls (since RLS won't recognize Clerk users)
- OR: Create a new edge function `emma-db-proxy` that handles CRUD for conversations/messages with Clerk auth

**Database migration**
- The `user_id` columns currently expect Supabase UUIDs. Clerk IDs are strings like `user_2x...`. Need to alter `user_id` columns from `uuid` to `text` across all tables: `conversations`, `messages` (via conversations), `memory_episodes`, `goals`, `benchmark_runs`, `improvement_logs`, `api_keys`, `profiles`, `user_roles`
- Update RLS policies to remove `auth.uid()` references (they won't work with Clerk) and instead use service-role-only access with edge function gatekeeping
- Drop the `handle_new_user` trigger (it fires on Supabase auth signup, not Clerk)

## Part 2: Admin Aggregate Learning Dashboard

### New database tables

**`admin_insights` table**
- `id`, `insight_type` (pattern/weakness/improvement/trend), `category`, `description`, `data` (jsonb), `applied`, `created_at`
- No user_id — these are system-wide aggregations

**`learning_patterns` table**  
- `id`, `pattern_type` (common_question/failure_mode/success_pattern/user_behavior), `pattern_data` (jsonb), `frequency`, `confidence_score`, `applied_to_prompt_version`, `created_at`

**`prompt_evolutions` table**
- `id`, `version`, `prompt_text`, `source_insights` (jsonb array of insight IDs), `performance_delta`, `active`, `created_at`

### New edge function: `supabase/functions/emma-admin-learn/index.ts`

Actions:
- **`aggregate_data`**: Query across ALL users' memory_episodes, benchmark_runs, improvement_logs, conversations, and goals. Produce aggregate statistics: common question categories, average quality scores, frequent failure modes, most effective improvement types
- **`extract_patterns`**: Use AI (gemini-2.5-pro) to analyze aggregated data and extract learning patterns — what types of queries Emma handles poorly, what reasoning approaches work best, common user needs
- **`generate_improvement`**: Based on patterns, use AI to generate improved system prompts, new benchmark questions, and reasoning pipeline adjustments
- **`apply_improvement`**: Write new prompt version to `prompt_evolutions`, update the active system prompt version used by `emma-chat` and `emma-self-improve`
- **`get_dashboard`**: Return full admin analytics: user count, total conversations, aggregate scores, pattern list, improvement history, trend charts data

All actions require admin role verification.

### New page: `src/pages/AdminLearning.tsx`

Tabs:
1. **Aggregate Analytics** — Total users, conversations, messages, memory episodes. Charts showing quality score trends, category breakdowns, usage patterns over time
2. **Learned Patterns** — Table of extracted patterns with type, frequency, confidence. Ability to mark patterns as "applied" or "dismissed"
3. **Prompt Evolution** — History of system prompt versions with performance deltas. Side-by-side diff view. "Generate New Version" button that triggers AI analysis
4. **Mass Improvement** — One-click "Analyze All Data & Improve" button that runs the full pipeline: aggregate → extract patterns → generate improvement → preview → apply
5. **User Insights** — Anonymized breakdown of user behavior patterns, common queries, satisfaction trends

### Route and navigation
- Add `/admin` route in `App.tsx`, protected + admin-role-gated
- Add admin link in sidebar/settings for admin users

### Admin role check
- Create edge function logic to verify admin role: check `user_roles` table for the Clerk user ID with `role = 'admin'`
- Frontend: query admin status on load, conditionally show admin UI

## File Changes Summary

| File | Action |
|------|--------|
| All 11 edge functions | Update auth from Supabase to Clerk JWT verification |
| `src/lib/agi-api.ts` | Pass Clerk token |
| `src/hooks/useAuth.tsx` | Add session token access |
| `src/hooks/useConversations.tsx` | Route through edge function proxy |
| `src/hooks/useMessages.tsx` | Route through edge function proxy |
| `supabase/functions/emma-db-proxy/index.ts` | New — CRUD proxy with Clerk auth |
| `supabase/functions/emma-admin-learn/index.ts` | New — aggregation + learning engine |
| `src/pages/AdminLearning.tsx` | New — admin dashboard |
| `src/App.tsx` | Add `/admin` route |
| Database migration | Alter user_id columns uuid→text, update RLS, drop trigger |


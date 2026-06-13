## Goal

Make every promise on the landing page actually work, level up the Project IDE so it behaves like a real IDE, and add a `/changelog` page listing all recent updates. Audit results below drive the work.

## Audit summary

Landing.tsx makes 16 feature claims + 8 mode claims. Real and working today: Chat, Research panel UI, Artifacts/Build, Computer-Use Agent, Code Execution (E2B), GitHub commit/push/pull, AGI Dashboard UI, Project IDE shell, Physics Inventions.

Gaps:
- **Multi-Agent Swarm** — claimed, no orchestration UI/route.
- **Formal Safety Layer** — claimed, no UI.
- **Cross-Domain Transfer** — claimed (DB table + edge fn exist), no UI.
- **Image Generation** — claimed, no dedicated entry; only `/image` slash command.
- **Autonomous Loops / Self-Improvement** — Dashboard UI exists, cron + edge fn need verification + visible status.
- **Voice / Data Analysis** — components exist; need a quick QA pass.
- **Payment** — manual Cash App handle; out of scope for "make real" unless user wants Stripe (will ask separately if needed).

ProjectIDE gaps:
- Extensions panel is a fake static list.
- No diff viewer or branch UI in GitPanel.
- No persistent terminal in the main layout (toggle-only).
- File storage is a JSON blob (scale limit) — leaving as-is, flagging only.
- No LSP — leaving as-is (large effort), flagging only.

## Phase 1 — Wire up missing homepage promises

1. **Multi-Agent Swarm page** (`/swarm`)
   - New `src/pages/AgentSwarm.tsx` route using existing `src/components/AgentSwarm.tsx`.
   - Spawn parallel sub-agents via existing `emma-multi-agent` edge function; show live status cards.
   - Add nav link from Landing feature card → `/swarm`.

2. **Formal Safety page** (`/safety`)
   - New page using existing `emma-formal-safety` + `emma-safety` edge functions.
   - Show CVSS gating, last verifications from `safety_verifications` table.
   - Link from Landing feature card.

3. **Cross-Domain Transfer page** (`/transfer`)
   - New page reading `transfer_knowledge` table + calling `emma-transfer-sensory`.
   - Form to submit source/target domains; list of past transfers with similarity scores.
   - Link from Landing.

4. **Image Generation page** (`/images`)
   - New page calling existing `emma-image-gen` edge function with prompt + model picker (Gemini 3 Pro / nano-banana label).
   - Grid of generated images, download/save buttons.
   - Link from Landing.

5. **Autonomous Loops status panel**
   - Add a "Last run / next run / success rate" widget to `AGIDashboard` reading `autonomous_runs` table.
   - Verify cron exists for `emma-autonomous-loop`; if missing, add it via insert tool.

6. **Voice & Data Analysis QA**
   - Open both panels in browser, fix any broken buttons / 500s, ensure they show empty-state when no API key.

7. **Landing.tsx polish**
   - Every feature card becomes a real link to its delivering page (no dead cards).
   - Remove or honestly relabel any claim we can't back.

## Phase 2 — Make the IDE real(er)

1. **Real diff viewer** in GitPanel using Monaco's `DiffEditor` — show pending changes per file before commit.
2. **Branch UI** — list branches, checkout, create new branch (via `emma-github` edge fn; extend if needed).
3. **Persistent terminal** — add terminal as a bottom-pinned panel in `ProjectIDE` (alongside GitPanel via tabs), not just a toggle inside CodeEditor.
4. **Real extensions panel** — replace static list with a small registry stored in DB; "install" toggles a flag that enables panel features (e.g., enabling "Git Graph" reveals a commit log view).
5. **PR creation button** in GitPanel — POST to `emma-github` with `action: "open_pr"`; extend edge fn if missing.
6. **Run output panel** — capture stdout/stderr from CodeRunner into a dedicated output tab instead of toast.
7. **Save status indicator** — show "Saved / Saving / Error" badge tied to the debounced auto-save.

## Phase 3 — Changelog

1. **`/changelog` page** with curated list of updates from recent work:
   - Computer-use 100%-accurate clicks
   - Physics Inventions (cron, prompts, build instructions, [object Object] fix)
   - All Phase 1 + Phase 2 items above
2. **Recap in chat** — I'll also list the same updates in my closing message after build.
3. Link from sidebar + landing footer.

## Technical notes

- All new pages follow existing pattern: `src/pages/X.tsx` + route in `src/App.tsx`, lazy import not required.
- Tokens via `useAuth().getToken`, calls via `dbProxy` or direct `supabase.functions.invoke`.
- No new tables needed except possibly `ide_extensions` (workspace-scoped, RLS by user); will use migration tool with required GRANTs.
- Cron additions via `supabase--insert` (per cron rules), not migration.
- No changes to `client.ts`, `types.ts`, `.env`, or `config.toml`.

## Out of scope (will ask separately if you want them)

- Replacing manual Cash App with Stripe Checkout.
- Full LSP / IntelliSense inside Monaco (multi-week effort).
- Migrating IDE storage from JSON column to Supabase Storage + real git working tree.
- Real-time multiplayer IDE.

## Deliverables checklist

- [ ] 4 new pages: Swarm, Safety, Transfer, Images
- [ ] AGIDashboard loop status widget + cron verified
- [ ] Landing feature cards all link to real pages
- [ ] IDE: diff viewer, branch UI, persistent terminal, real extensions, PR button, output panel, save indicator
- [ ] `/changelog` page + sidebar/footer links
- [ ] Closing message lists every update

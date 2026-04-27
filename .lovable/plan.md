# Emma Intelligence → AGI/ASI Upgrade Roadmap

## Current State (audit)

You already have strong AGI scaffolding:
- **Cognition**: `emma-multi-agent` (Analyst/Critic/Synthesizer/Validator/Meta), `emma-causal-engine`, `emma-world-model`, `emma-self-improve`, `emma-formal-safety`, `emma-transfer-sensory`
- **Execution**: `emma-code-exec` (E2B sandbox), `emma-computer-use`, `emma-github`, `emma-orchestrator`
- **Memory**: `memory_episodes` w/ embeddings, `transfer_knowledge` (vector RAG), `world_model_states`, `metacognitive_logs`
- **Autonomy**: `emma-autonomous-loop` w/ goals + cron
- **Knowledge**: `emma-research`, `emma-web-search`, `emma-image-gen`
- **Infra**: Clerk auth, RLS, admin role, usage tracking, paywall, IDE, benchmarks

What's missing to be **measurably AGI/ASI** (per ARC-AGI-2, METR, BIG-bench Hard, plus novel capabilities) is below.

---

## Tier 1 — AGI Criteria Gaps (must-have)

### 1. Continual / Lifelong Learning Loop
Today: episodic memory exists, but the agent doesn't retrain its policy from outcomes.
Add: `emma-rlhf-loop` edge fn that nightly:
- Pulls `messages` + `MessageFeedback` + `benchmark_runs` outcomes
- Runs DPO-style preference distillation into a per-user **prompt-evolution genome** (extends existing `prompt_evolutions`)
- Scores improvement on a held-out eval set, auto-promotes winning prompts to active

### 2. Tool Synthesis (write-its-own-tools)
Today: tools are hardcoded edge functions.
Add: `emma-tool-forge` — agent specs a missing capability → generates an edge function via `emma-code-exec` → deploys via Supabase Management API → registers in a new `agent_tools` table → future agents auto-discover it. This is the single biggest ASI multiplier and almost no one ships it.

### 3. Hierarchical Planner (HTN + Tree-of-Thought + MCTS)
Today: orchestrator is mostly linear.
Add: `emma-planner` that decomposes goals into a DAG, runs MCTS rollouts using the world model as simulator, picks branch with highest expected utility, persists plan tree to new `plan_nodes` table. Re-plans on failure.

### 4. Long-Horizon Task Memory (METR-style)
Today: 5–10 message context.
Add: hierarchical memory consolidation cron — episodic → semantic → schematic. Use Gemini 2.5 Pro to summarize at 3 levels (hour/day/week). Add `memory_summaries` table. Enables coherent multi-day projects.

### 5. Self-Verification + Formal Guarantees
Today: `emma-formal-safety` exists but isn't gating outputs.
Add: every code/action output goes through (a) unit-test auto-gen + run in E2B, (b) constitutional check, (c) lean-style invariant check for math/finance. Reject + retry on fail. Surface confidence interval.

### 6. Embodied / Multimodal I/O
Today: text + computer-use only.
Add:
- **Vision pipeline**: screenshot → Gemini 3 Pro Image for scene understanding, feed into world model
- **Voice duplex**: extend `VoicePanel` to use ElevenLabs (already configured) + Whisper for full real-time conversation
- **Document grounding**: PDF/image upload → OCR → indexed in `memory_episodes`

---

## Tier 2 — ASI Criteria (super-human)

### 7. Recursive Self-Improvement Governor
Extend `emma-self-improve`:
- Run monthly **capability benchmark** (existing `emma-benchmark`) before + after each prompt mutation
- Only commit mutations with statistically significant lift (p<0.05)
- Maintain ELO rating per agent role; deprecate losers
- Hard cap: refuse mutations that lower safety score (uses `emma-formal-safety`)

### 8. Multi-Model Council w/ Debate + Vote
Replace single-model swarm with cross-provider council: Gemini 3 Pro + GPT-5.2 + GPT-5 + Gemini 2.5 Pro debate each turn, Meta-agent adjudicates. Empirically beats any single model on ARC-AGI-2 / GPQA.

### 9. Causal World Model with Counterfactuals
Upgrade `emma-causal-engine`:
- Store causal graph in new `causal_edges` table (cause, effect, strength, evidence)
- Support `do()`-calculus queries: "what if I had done X?"
- Use for plan evaluation in #3

### 10. Cross-Session, Cross-User Knowledge Distillation (opt-in)
Anonymized successful problem→solution pairs flow into a global `collective_knowledge` table (admin-curated). Every user benefits from every other user's successes. Privacy via differential-privacy noise.

---

## Tier 3 — Features No One Else Ships

### 11. Emma OS — Persistent Virtual Workstation
Each user gets a long-lived E2B sandbox (already have E2B_API_KEY) snapshotted to S3-equivalent. Files, installed packages, browser sessions persist across chats. UI: `Terminal.tsx` + `FileExplorer.tsx` already exist — wire to persistent sandbox lifecycle managed by new `emma-vm` fn (boot/snapshot/restore/destroy).

### 12. Agent Marketplace (token-incentivized)
Users publish custom agent personas / tool-forged tools (#2). Other users install them. Author earns micro-credits on each invocation. Tables: `agent_marketplace`, `agent_installs`. Combines with existing payment infra.

### 13. Live Code Co-Pilot inside the IDE
`ProjectIDE.tsx` already exists. Add **inline ghost-text completion** streamed from `emma-chat`, **Cursor-style multi-file edit** via diff proposals shown in `BuilderPanel`, and **automatic test generation + run** on every save.

### 14. Constitutional Personalization
Per-user `constitution` document (editable in Settings) — natural-language rules the agent must always follow. Loaded into every system prompt. Versioned; rollback supported. Differentiator vs ChatGPT custom instructions: enforced by separate Critic agent, not just prompt.

### 15. Time-Travel Debugging for Agent Runs
Every autonomous_run / multi-agent swarm captures full state snapshots. UI in `AGIDashboard` lets you scrub the timeline and re-run from any node with modified inputs. Unique in the agent space.

### 16. Sovereign Mode (offline / on-prem)
Optional Ollama backend toggle (you mentioned Ollama in original brief). Edge fn `emma-chat` already abstracts model — add a `model_provider` enum (`lovable_ai` | `ollama_local`). User points to their local Ollama URL via Settings; chat round-trips through their own infra. Compliance win for healthcare/gov.

### 17. Healthcare-Grade Evidence Mode
Activated per-conversation. Forces:
- Every claim cited (uses `emma-research` w/ Perplexity)
- HIPAA-style PHI redaction in `messages` table via trigger
- Output formatted as SOAP/FHIR snippet when applicable
- Export to signed PDF audit trail

### 18. Real-Time Group Cognition (multiplayer agent)
Multiple humans + Emma in one conversation via Supabase Realtime channel. Emma maintains per-participant working memory + facilitates. Foundation already exists (`messages` table + realtime).

### 19. Capability Self-Report Card (public)
`/capabilities` page auto-publishes Emma's latest scores: ARC-AGI-2, GPQA, SWE-bench Verified, HumanEval, plus your own internal benchmark. Auto-updated by `emma-benchmark` cron. Radical transparency = trust moat.

### 20. Economic Agent (DeFi sandbox)
Optional module: Emma can run `read-only` Polygon RPC queries, simulate trades, propose strategies — never executes without explicit signed approval. Tables: `defi_strategies`, `defi_simulations`. Differentiates from every other AI platform.

---

## Technical Architecture Summary

```text
                       ┌─ Council (multi-model debate) ──┐
   user/cron ──► Planner (HTN+MCTS) ──► Orchestrator ─┤  ├──► Tool Forge ──► new edge fns
                       │                              └─ Critic + Formal Safety gate ─┘
                       ▼                                            │
                 World Model + Causal Graph ◄──── Memory (episodic→semantic→schematic)
                       │                                            ▲
                       └────────► RLHF Loop ──────► Prompt Genome ──┘
```

### New tables
`agent_tools`, `plan_nodes`, `memory_summaries`, `causal_edges`, `collective_knowledge`, `agent_marketplace`, `agent_installs`, `constitutions`, `defi_strategies`

### New edge functions
`emma-rlhf-loop`, `emma-tool-forge`, `emma-planner`, `emma-vm`, `emma-council`, `emma-evidence`, `emma-defi`

### UI additions
`/capabilities` page, Time-Travel scrubber in `AGIDashboard`, Marketplace page, Constitution editor in Settings, Sovereign-mode toggle

---

## Suggested Build Order (phased)

1. **Foundations**: #1 RLHF loop, #4 hierarchical memory, #14 constitutions
2. **Cognition leap**: #3 planner, #8 council, #9 causal counterfactuals, #5 self-verification
3. **Differentiators**: #2 tool forge, #11 Emma OS, #15 time-travel, #19 capability report
4. **Ecosystem**: #12 marketplace, #18 multiplayer, #16 sovereign mode
5. **Verticals**: #17 healthcare, #20 DeFi

I'll implement in this order unless you reprioritize. Approve to proceed, or tell me which tier/items to start with.

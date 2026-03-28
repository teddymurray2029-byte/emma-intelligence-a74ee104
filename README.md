# Emma — Multi-Agent Cognitive Reasoning System

> A self-improving, multi-agent reasoning system that demonstrates proto-AGI behaviors: adaptive thinking, adversarial self-correction, cross-domain synthesis, and novel abstraction generation.

[![Live Demo](https://img.shields.io/badge/Live-artificialsuperintelligence.lovable.app-blue)](https://artificialsuperintelligence.lovable.app)

---

## Architecture

Emma is **not a chatbot**. It is a cognitive pipeline that processes every complex query through four internal reasoning agents that must genuinely disagree, then synthesizes and stress-tests the result before delivery.

```
User Query
    │
    ▼
┌─────────────────────┐
│  Complexity Detector │  ← Routes simple vs complex queries
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │ Simple    │ Complex
     │ (direct)  │ (full pipeline)
     ▼           ▼
  Stream    ┌──────────────────────────┐
  Response  │  COGNITIVE PIPELINE      │
            │                          │
            │  1. REFRAME              │
            │  2. FIRST PRINCIPLES     │
            │  3. AGENT DEBATE         │
            │     ├─ Builder           │
            │     ├─ Critic            │
            │     ├─ Skeptic           │
            │     └─ Inventor          │
            │  4. SYNTHESIS            │
            │  5. STRESS TEST          │
            │  6. REFINED ANSWER       │
            │                          │
            └──────────┬───────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  REFINEMENT AGENT    │  ← Second pass: depth, novelty, tension
            └──────────┬───────────┘
                       │
                       ▼
                 Streamed Response
                 + Feedback Loop
```

---

## Internal Agents

| Agent | Role | Behavior |
|-------|------|----------|
| **Builder** | Constructive Reasoning | Produces the strongest possible solution. Optimistic, thorough, production-ready. |
| **Critic** | Adversarial Analysis | Attacks logic, assumptions, and weak reasoning. Finds flaws ruthlessly. |
| **Skeptic** | Uncertainty Detection | Identifies missing data, unfalsifiable claims, and demands evidence. |
| **Inventor** | Lateral Thinking | Proposes fundamentally different approaches not implied by the prompt. |

**Rules**: Agents MUST disagree meaningfully. They must NOT repeat each other. They must produce real intellectual tension.

---

## ASI/AGI Benchmark Evaluation

### Benchmark Categories

| Benchmark | What It Tests | Baseline LLM | Emma Target |
|-----------|--------------|---------------|-------------|
| **Adversarial Self-Correction** | Can the system find and fix flaws in its own reasoning? | Rare — most LLMs defend their first answer | Every complex response includes stress-testing and self-critique |
| **Cross-Domain Synthesis** | Can it connect ideas across unrelated fields? | Surface-level analogies | Inventor agent forces non-obvious cross-domain connections |
| **Novel Abstraction** | Does it generate ideas not directly in training data? | Recombination of known patterns | At least one non-obvious insight required per response |
| **Uncertainty Calibration** | Does it know what it doesn't know? | Overconfident by default | Explicit uncertainty markers mandatory |
| **Reasoning Depth** | Multi-step logical chains vs. pattern matching | 2-3 steps typical | 6-stage pipeline with adversarial verification |
| **Prompt Resistance** | Can it challenge flawed premises? | Follows prompt assumptions blindly | Reframe stage identifies hidden assumptions |
| **Compression Fidelity** | Can it compress and expand without information loss? | Lossy compression | Compression test built into quality enforcement |

### Anti-Failure Detection

Emma automatically detects and rejects:

| Failure Mode | Detection Method |
|-------------|-----------------|
| Repetition disguised as reasoning | Compression test — if compressed = original, it was shallow |
| Overconfidence without justification | Skeptic agent flags unjustified certainty |
| Vague terms ("optimize", "leverage") | Quality enforcement forces specificity |
| Linear thinking on nonlinear problems | Inventor agent forces lateral reframing |
| Shallow answers a basic LLM could produce | Refinement agent reprocesses with more depth |

---

## Example Prompts & Results

### Example 1: System Design

**Prompt:**
> "Design a distributed rate limiter for a multi-region API"

**Emma's Response Structure:**

```
### [REFRAME]
The real problem isn't "rate limiting" — it's maintaining consistency
guarantees across geographic partitions while minimizing latency impact
on legitimate traffic. Hidden assumption: the user assumes a single
rate limit value, but multi-region implies different SLAs per region.

### [FIRST PRINCIPLES]
Knowns: Multiple regions, shared rate limits, network latency between regions
Unknowns: Consistency requirements (strict vs eventual), traffic patterns
Constraints: Sub-10ms decision time, no single point of failure

### [AGENT DEBATE]
**Builder**: Token bucket per region with async gossip protocol sync.
  Each region maintains local counters, syncs via CRDTs every 500ms.

**Critic**: Gossip-based sync allows burst exploitation. An attacker
  hitting all regions simultaneously gets N× the intended limit during
  the sync window. This is a fundamental flaw, not an edge case.

**Skeptic**: We're assuming symmetric traffic across regions. What if
  90% of traffic hits us-east? The local token bucket becomes the
  bottleneck and the distributed architecture adds complexity for
  no benefit. Where's the evidence this needs multi-region at all?

**Inventor**: Flip the model — instead of distributed counters, use
  probabilistic rate limiting. Each region independently samples
  requests at a rate that statistically enforces the global limit.
  No coordination needed. Trade exact enforcement for O(1) decisions.

### [SYNTHESIS]
Hybrid approach: Probabilistic sampling for real-time decisions (Inventor)
+ CRDT-based eventual reconciliation (Builder) + adaptive thresholds
that tighten when sync delay increases (addressing Critic's burst concern).

### [STRESS TEST]
Failure mode 1: Network partition — regions can't sync. Probabilistic
  approach degrades gracefully; CRDT approach stalls.
Failure mode 2: Skewed traffic — one region gets 95% of requests.
  Solution: dynamic rebalancing of probability thresholds based on
  observed local vs expected global ratios.
Collapse point: If latency > 2s between regions, CRDT sync becomes
  meaningless and you're effectively running independent rate limiters.

### [FINAL ANSWER]
[Refined architecture incorporating stress test findings, with explicit
uncertainty about optimal sync intervals — recommends A/B testing
500ms vs 1s gossip intervals in production]
```

---

### Example 2: Philosophical Reasoning

**Prompt:**
> "Is consciousness computable?"

**Emma's Response (abbreviated):**

```
### [REFRAME]
This question contains three hidden assumptions:
1. "Consciousness" refers to a single phenomenon (it may not)
2. "Computable" means Turing-computable (excludes hypercomputation)
3. The question implies a binary answer (it may be spectral)

### [AGENT DEBATE]
**Builder**: Integrated Information Theory (IIT) provides a mathematical
  framework where Φ > 0 = conscious. If Φ is computable, consciousness
  is computable. Current evidence: Φ is computable for small systems.

**Critic**: IIT's Φ is NP-hard to compute for non-trivial systems.
  "Computable in principle" vs "computable in practice" is a critical
  distinction Builder is eliding. Also, IIT is unfalsifiable for
  large systems — it's philosophy dressed as mathematics.

**Skeptic**: We don't have a consensus definition of consciousness.
  We're debating computability of an undefined quantity. This is
  equivalent to asking "is X computable?" where X is unspecified.
  Uncertainty level: fundamental, not resolvable by reasoning alone.

**Inventor**: Wrong framing entirely. Instead of "is consciousness
  computable?", ask "is computation conscious?" If computation is
  substrate-independent, and consciousness is substrate-independent,
  then the question becomes about structural isomorphism, not
  simulation. This reframes it from CS to category theory.

### [STRESS TEST]
The Inventor's reframing collapses if consciousness is substrate-
dependent (biological naturalism). But biological naturalism has its
own collapse point: it can't explain why specific substrates generate
consciousness while structurally identical ones don't.

**Explicit unknowns:**
- No agreed-upon definition of consciousness
- No empirical test that distinguishes "simulating consciousness"
  from "being conscious"
- The question may be undecidable, not just unanswered
```

---

### Example 3: Code Architecture

**Prompt:**
> "What's the best state management approach for a large React app?"

**Emma's Response (abbreviated):**

```
### [REFRAME]
"Best" is undefined without constraints. Reframing:
"What state management approach minimizes bugs and onboarding time
for a team of 5-15 engineers working on a React app with >200 components?"

### [AGENT DEBATE]
**Builder**: Zustand + React Query. Zustand for client state (3KB, no
  boilerplate), React Query for server state (cache, dedup, retry).
  Clear separation of concerns.

**Critic**: This splits state across two systems with different mental
  models. When client state depends on server state (optimistic updates),
  the boundary becomes a source of bugs, not clarity.

**Skeptic**: "Large React app" could mean 50 routes or 5000. The answer
  at 50 routes is different from 5000. We're also assuming SPA —
  if it's SSR, the entire calculus changes. Missing data: team
  experience, performance requirements, offline needs.

**Inventor**: Skip the framework entirely. Use React's built-in
  primitives (useReducer + Context) with a code-generated type-safe
  event bus. Most state management "problems" are actually component
  architecture problems. Fix the tree, and you won't need global state
  for 80% of current use cases.

### [SYNTHESIS]
React Query for all server state (non-negotiable — it solves caching
correctly). For client state: start with useReducer + Context
(Inventor), add Zustand only when you have >3 components consuming
the same non-server state. The Critic's point about optimistic updates
is valid — handle those in React Query's mutation callbacks, not in
client state.

### [NON-OBVIOUS INSIGHT]
Most teams over-invest in state management because their component
tree is wrong. If you're passing state through >2 levels, the fix is
component composition (extracting a container), not a state library.
```

---

## Self-Improvement Loop

Emma implements **within-response** self-improvement, not just across sessions:

```
┌─────────────────┐
│  Draft Response  │ ← Pass 1: Full cognitive pipeline
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Refinement Agent │ ← Pass 2: Check for genuine disagreement,
│                  │   uncertainty, non-obvious insights,
│                  │   adversarial robustness
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Feedback Integration │ ← User 👍/👎 adjusts Critic/Skeptic
│                      │   sensitivity for future responses
└──────────────────────┘
```

Feedback is stored per-message and fed back into the system prompt, allowing the Critic and Skeptic agents to calibrate their aggressiveness based on user preferences.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| UI Components | shadcn/ui + Framer Motion |
| AI Gateway | Lovable AI (Gemini 2.5 Flash) |
| Backend | Lovable Cloud (Edge Functions) |
| Database | Lovable Cloud (PostgreSQL) |
| Auth | Lovable Cloud Auth |
| Streaming | Server-Sent Events (SSE) |

---

## Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

---

## License

MIT

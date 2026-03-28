# Emma — AI Operating System

> A multi-agent cognitive reasoning system with computer-use capabilities, project IDE, deep research, and autonomous task execution — all in one AI workspace.

[![Live Demo](https://img.shields.io/badge/Live-emma--intelligence.lovable.app-blue)](https://emma-intelligence.lovable.app)

---

## Features

### 🧠 Multi-Agent Cognitive Pipeline

Every complex query passes through four internal reasoning agents that must genuinely disagree, then synthesizes and stress-tests the result:

| Agent | Role |
|-------|------|
| **Builder** | Constructive reasoning — produces the strongest possible solution |
| **Critic** | Adversarial analysis — attacks logic, assumptions, and weak reasoning |
| **Skeptic** | Uncertainty detection — demands evidence and flags missing data |
| **Inventor** | Lateral thinking — proposes fundamentally different approaches |

### 🖥️ Computer-Use Agent

Spin up an isolated virtual desktop where Emma controls mouse and keyboard to perform real-world tasks:

- Opens browsers, clicks buttons, types text, scrolls, switches tabs
- Follows a **plan → screenshot → action → verify** reasoning loop
- Handles login flows, multi-step web workflows, and complex GUI tasks
- Live desktop stream with real-time observation
- User intervention chat and "Stop Emma" button
- Ephemeral OS — destroyed after task completion

**Example tasks:**
- "Apply to 10 frontend developer jobs on Indeed"
- "Research the top 3 AI coding tools and make a comparison table in Google Docs"
- "Book a flight on Delta from Las Vegas to New York under $450"
- "Post this thread on X/Twitter and reply to the first 20 comments"
- "Scrape all comments on this YouTube video and save to CSV"

### 💻 Project IDE & Source Control

Full in-browser development environment:

- **File Explorer** — Tree view with create, rename, delete, and context menus
- **Code Editor** — Monaco-powered editor with syntax highlighting, multi-tab support
- **GitHub Integration** — Push, pull, and commit via GitHub REST API
- **ZIP Import/Export** — Extract uploaded ZIP files into projects, export projects as ZIP
- **Auto-save** — Files persist to database with debounced saving

### 🔍 Deep Research Mode

Source-grounded research with citations:

- Multi-step research plans with progress tracking
- Web search integration via Perplexity API
- Citation management with source attribution
- Full report generation with confidence scores

### 📄 Artifacts

Create and edit documents, code, reports, and plans:

- Versioned artifacts with full history
- Code blocks auto-extract into editable artifacts
- Supports markdown, code, HTML, React components, tables, and prompts

### 🎤 Voice Mode

Live voice conversation with speech-to-text input and text-to-speech output via ElevenLabs.

### 📊 Data Analysis

Upload and analyze CSV, JSON, and other data files with AI-powered insights.

### 🧠 Memory & Context

Persistent episodic memory for cross-session context recall and personalization.

### 🤔 Think Mode

Extended planning and reasoning with visible chain-of-thought.

### 🔧 Builder Mode

Autonomous multi-step task execution with agent orchestration.

---

## Modes

| Mode | Description |
|------|-------------|
| **Chat** | General AI assistant with answer style controls (concise / standard / deep / direct) |
| **Research** | Deep research with citations and source grounding |
| **Artifacts** | Create and edit versioned documents and code |
| **Think** | Planning and extended reasoning |
| **Builder** | Autonomous task execution |
| **Agent** | Computer-use agent with virtual OS sandbox |
| **Projects** | Full IDE with filesystem, editor, and GitHub integration |
| **Voice** | Live voice conversation |
| **Data** | File and data analysis |
| **Memory** | Context and recall management |

---

## Architecture

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

## Computer-Use Agent Architecture

```
User Task
    │
    ▼
┌──────────────────────┐
│  Create E2B Desktop  │  ← Ephemeral sandbox with browser + desktop
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────┐
│         AGENT LOOP (max 50 steps)    │
│                                      │
│  1. Screenshot current desktop       │
│  2. Send to Gemini 2.5 Pro (vision)  │
│  3. AI reasons about what it sees    │
│  4. AI decides next action:          │
│     click / type / scroll / hotkey   │
│     open_url / wait / done           │
│  5. Execute action on sandbox        │
│  6. Repeat from step 1               │
│                                      │
│  User can intervene at any step      │
│  via the intervention chat           │
└──────────────────┬───────────────────┘
                   │
                   ▼
         ┌───────────────────┐
         │  Summary + Screenshots  │
         │  Sandbox destroyed      │
         └─────────────────────────┘
```

---

## Access Tiers

| Tier | Access |
|------|--------|
| **Anonymous** | 25 free messages with fingerprint-based tracking |
| **Paid ($12)** | Unlimited messages via Stripe one-time payment |
| **Admin** | Unlimited messages, admin dashboard, learning controls |

Anti-abuse measures include browser fingerprinting, IP-based linking, and cross-fingerprint detection.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| UI Components | shadcn/ui + Framer Motion |
| Code Editor | Monaco Editor |
| AI Models | Lovable AI Gateway (Gemini 2.5 Pro/Flash, GPT-5) |
| Computer Use | E2B Desktop Sandbox + AI Vision |
| Backend | Supabase Edge Functions |
| Database | PostgreSQL (Supabase) |
| Auth | Clerk |
| Payments | Stripe |
| Voice | ElevenLabs TTS + Web Speech API |
| Search | Perplexity API |
| Source Control | GitHub REST API v3 |
| Streaming | Server-Sent Events (SSE) |

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `emma-chat` | Streaming chat with cognitive pipeline |
| `emma-computer-use` | Computer-use agent sandbox management + AI reasoning |
| `emma-research` | Deep research with web search |
| `emma-github` | GitHub push/pull/commit operations |
| `emma-image-gen` | AI image generation |
| `emma-multi-agent` | Multi-agent orchestration |
| `emma-db-proxy` | Authenticated database operations (conversations, projects, usage) |
| `emma-web-search` | Web search via Perplexity |
| `emma-code-exec` | Sandboxed code execution via E2B |
| `emma-self-improve` | Self-improvement and prompt evolution |
| `emma-benchmark` | Performance benchmarking |
| `emma-safety` | Content safety filtering |
| `create-payment` | Stripe checkout session creation |
| `verify-payment` | Payment verification and access upgrade |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `conversations` | Chat conversation metadata |
| `messages` | Individual messages with metadata |
| `projects` | IDE projects with files stored as JSONB |
| `profiles` | User display names and avatars |
| `user_roles` | Role-based access (admin, moderator, user) |
| `usage_tracking` | Anonymous usage metering and fingerprints |
| `payments` | Stripe payment records |
| `fingerprint_links` | Cross-fingerprint abuse detection |
| `memory_episodes` | Persistent episodic memory |
| `goals` | System and user goals |
| `improvement_logs` | Self-improvement history |
| `benchmark_runs` | Performance benchmark results |
| `learning_patterns` | Detected usage patterns |
| `prompt_evolutions` | System prompt version history |
| `admin_insights` | Admin-facing analytics |
| `api_keys` | API key management |

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

# Emma — AI Operating System

> A multi-agent cognitive reasoning system with computer-use capabilities, project IDE, deep research, and autonomous task execution — all in one AI workspace.

[![Live Demo](https://img.shields.io/badge/Live-emma--intelligence.lovable.app-blue)](https://emma-intelligence.lovable.app)

---

## Quick Start

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd emma

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Environment Variables

The project uses Lovable Cloud (Supabase) for backend services. The following variables are auto-configured:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Backend API URL (auto-set) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public anon key (auto-set) |
| `VITE_SUPABASE_PROJECT_ID` | Project identifier (auto-set) |

### Edge Function Secrets

These must be configured in the backend secrets dashboard for full functionality:

| Secret | Required For | How to Get |
|--------|-------------|------------|
| `CLERK_SECRET_KEY` | User authentication | [clerk.com](https://clerk.com) → API Keys |
| `CLERK_PUBLISHABLE_KEY` | Auth (frontend) | Same Clerk dashboard |
| `STRIPE_SECRET_KEY` | Payment processing | [stripe.com](https://stripe.com) → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Payment verification | Stripe → Webhooks → Signing secret |
| `E2B_API_KEY` | Computer-use agent (desktop VM) | [e2b.dev](https://e2b.dev) → Dashboard → API Keys |
| `ELEVENLABS_API_KEY` | Voice mode (TTS) | [elevenlabs.io](https://elevenlabs.io) → Profile → API Key |
| `PERPLEXITY_API_KEY` | Deep research / web search | [perplexity.ai](https://perplexity.ai) → API Settings |

> **Note:** The AI chat itself uses the Lovable AI Gateway and requires no additional API key.

---

## Features

### 🧠 Multi-Agent Cognitive Pipeline

Every complex query passes through four internal reasoning agents:

| Agent | Role |
|-------|------|
| **Builder** | Constructive reasoning — strongest possible solution |
| **Critic** | Adversarial analysis — attacks logic and assumptions |
| **Skeptic** | Uncertainty detection — demands evidence |
| **Inventor** | Lateral thinking — fundamentally different approaches |

### 🖥️ Computer-Use Agent

Spin up an isolated Ubuntu 22.04 virtual desktop where Emma controls mouse and keyboard:

- **plan → screenshot → action → verify** reasoning loop
- Handles login flows, multi-step web workflows, and GUI tasks
- Live screenshot polling with real-time observation
- User intervention chat and "Stop Emma" button
- Ephemeral sandbox — destroyed after task completion

**Example tasks:**
- "Apply to 10 frontend developer jobs on Indeed"
- "Book a flight on Delta from Las Vegas to New York under $450"
- "Scrape all comments on this YouTube video and save to CSV"

### 💻 Project IDE & Source Control

- **File Explorer** — tree view with create, rename, delete
- **Code Editor** — Monaco-powered with syntax highlighting and multi-tab
- **GitHub Integration** — push, pull, commit via GitHub REST API
- **ZIP Import/Export** — extract uploaded ZIPs, export projects as ZIP
- **Auto-save** — files persist to database with debounced saving

### 🔍 Deep Research Mode

- Multi-step research plans with progress tracking
- Web search via Perplexity API with citations
- Full report generation with confidence scores

### 📄 Artifacts

- Versioned documents, code, reports, and plans
- Supports markdown, code, HTML, React components, tables, and prompts

### 🎤 Voice Mode

Live voice conversation with speech-to-text input and ElevenLabs TTS output.

### 📊 Data Analysis

Upload and analyze CSV, JSON, and other data files with AI-powered insights.

### 🧠 Memory & Context

Persistent episodic memory for cross-session context recall.

### 🤔 Think Mode

Extended planning and reasoning with visible chain-of-thought.

### 🔧 Builder Mode

Autonomous multi-step task execution with agent orchestration.

---

## Modes

| Mode | Description |
|------|-------------|
| **Chat** | General AI assistant with answer style controls |
| **Research** | Deep research with citations |
| **Artifacts** | Versioned documents and code |
| **Think** | Planning and extended reasoning |
| **Builder** | Autonomous task execution |
| **Agent** | Computer-use agent with virtual OS sandbox |
| **Projects** | Full IDE with filesystem and GitHub |
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
     ▼           ▼
  Stream    ┌──────────────────────────┐
  Response  │  COGNITIVE PIPELINE      │
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
            └──────────┬───────────────┘
                       ▼
            ┌──────────────────────┐
            │  REFINEMENT AGENT    │
            └──────────┬───────────┘
                       ▼
                 Streamed Response
```

### Computer-Use Agent

```
User Task → Create E2B Desktop (Ubuntu 22.04 + XFCE)
    │
    ▼
┌──────────────────────────────────────┐
│         AGENT LOOP (max 50 steps)    │
│  1. Screenshot current desktop       │
│  2. Send to AI vision model          │
│  3. AI reasons about what it sees    │
│  4. AI decides: click/type/scroll/   │
│     hotkey/open_url/wait/done        │
│  5. Execute action on sandbox        │
│  6. Repeat                           │
└──────────────────┬───────────────────┘
                   ▼
         Summary + Sandbox destroyed
```

---

## Access Tiers

| Tier | Access |
|------|--------|
| **Anonymous** | 25 free messages (fingerprint-tracked) |
| **Paid ($12)** | Unlimited messages (Stripe one-time) |
| **Admin** | Unlimited + admin dashboard + learning controls |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 · TypeScript · Tailwind CSS · Vite |
| UI | shadcn/ui · Framer Motion |
| Code Editor | Monaco Editor |
| AI Models | Lovable AI Gateway (Gemini 2.5 Pro/Flash, GPT-5) |
| Computer Use | E2B Desktop Sandbox · AI Vision |
| Backend | Supabase Edge Functions |
| Database | PostgreSQL |
| Auth | Clerk |
| Payments | Stripe |
| Voice | ElevenLabs TTS · Web Speech API |
| Search | Perplexity API |
| Source Control | GitHub REST API v3 |
| Streaming | Server-Sent Events (SSE) |

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `emma-chat` | Streaming chat with cognitive pipeline |
| `emma-computer-use` | Computer-use agent sandbox + AI reasoning |
| `emma-research` | Deep research with web search |
| `emma-github` | GitHub push/pull/commit |
| `emma-image-gen` | AI image generation |
| `emma-multi-agent` | Multi-agent orchestration |
| `emma-db-proxy` | Authenticated database operations |
| `emma-web-search` | Web search via Perplexity |
| `emma-code-exec` | Sandboxed code execution |
| `emma-self-improve` | Self-improvement and prompt evolution |
| `emma-benchmark` | Performance benchmarking |
| `emma-safety` | Content safety filtering |
| `emma-api` | OpenAI-compatible API endpoint |
| `create-payment` | Stripe checkout session |
| `verify-payment` | Payment verification |

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `conversations` | Chat conversation metadata |
| `messages` | Individual messages with metadata |
| `projects` | IDE projects with files (JSONB) |
| `profiles` | User display names and avatars |
| `user_roles` | Role-based access (admin/moderator/user) |
| `usage_tracking` | Anonymous usage metering |
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

## Scripts

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run preview    # Preview production build
npm run test       # Run tests
npm run lint       # Lint code
```

---

## License

MIT

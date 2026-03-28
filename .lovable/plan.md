

# Aether — AI Operating System

## Honest Assessment

This is an enormous request. Many features (E2B sandboxed execution, video generation APIs, Browserbase computer-use, Suno music generation, GitHub Octokit integration) require external API keys and services the user hasn't configured yet. The plan below builds the **complete UI shell** with real functionality where possible, and **well-structured scaffolding** for API-dependent features that can be wired up incrementally.

**What works immediately (no extra keys):**
- Full Aether UI (sidebar, split-pane, chat, agents panel)
- Streaming AI chat (already working via edge function)
- Image generation (Lovable AI supports image models)
- Auth + persistent conversations (database)
- Monaco code editor panel
- Dashboard with recharts

**What needs API keys added later:**
- E2B (sandboxed execution) — needs `E2B_API_KEY`
- ElevenLabs (TTS/voice) — needs connector
- GitHub API (PRs, issues) — needs `GITHUB_TOKEN`
- Video generation — needs Kling/Runway API key
- Web search — needs Perplexity connector
- Music generation — needs Suno API key

## Architecture

```text
┌─────────────────────────────────────────────────┐
│                  AetherLayout                    │
├──────────┬──────────────────────────────────────┤
│ Sidebar  │  Main Content (split-pane)            │
│          │  ┌────────────┬──────────────────┐    │
│ • Chat   │  │  Chat      │  Right Panel     │    │
│ • Projects│  │  Messages  │  (IDE/Preview/   │    │
│ • Agents │  │  + Input   │   Agents/Dash)   │    │
│ • Memory │  │            │                  │    │
│ • Dash   │  └────────────┴──────────────────┘    │
│ • Settings│                                      │
└──────────┴──────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Database + Auth
- Create `profiles`, `conversations`, `messages` tables with RLS
- Auth pages (login/signup) with email/password
- Auto-create profile on signup via trigger

### Step 2: Rebrand Emma → Aether
- Update system prompt, header, avatar, all branding
- Replace cyan/purple palette with a warmer, more Arc-inspired scheme (deep navy bg, electric blue + warm amber accents)
- Update CSS variables and utility classes

### Step 3: Layout Shell
- `AetherLayout` with `SidebarProvider` + resizable split panes
- Sidebar: conversation list, new chat, navigation to Agents/Dashboard/Settings
- Right panel with tabs: IDE, Agents, Preview, Dashboard
- Mobile-responsive collapse behavior

### Step 4: Persistent Conversations
- CRUD conversations in sidebar
- Messages save to DB on send/receive
- Load conversation history on selection
- Auto-title conversations using first message

### Step 5: Code Editor Panel
- Integrate `@monaco-editor/react`
- Tab-based multi-file editing
- When AI returns code blocks → "Open in Editor" button
- Syntax highlighting, theme matching Aether dark mode

### Step 6: Agent Swarm UI
- `AgentSwarm` component showing Director + sub-agents (Researcher, Coder, Designer, Analyst, QA)
- Each agent card: avatar, status indicator, current task description
- Animated state transitions (idle → thinking → complete)
- Behind the scenes: single AI model, but system prompt switches based on "active agent"

### Step 7: Image Generation
- New edge function `aether-image-gen` using `google/gemini-3.1-flash-image-preview`
- Chat command detection or `/image` prefix
- Inline image display with download button

### Step 8: Dashboard
- `/dashboard` route with recharts
- Conversation count, message stats, token usage estimates
- Activity timeline chart

### Step 9: Voice Mode (ElevenLabs)
- Edge function for TTS using ElevenLabs connector
- Mic input via Web Speech API (browser-native STT)
- Voice toggle in chat input

### Step 10: Conversation Branching
- Fork button on any message → creates new conversation branch
- Visual branch indicator in sidebar

## Files to Create/Modify (~25 files)

**New pages:** `Login.tsx`, `Signup.tsx`, `Dashboard.tsx`
**New components:** `AetherLayout.tsx`, `AetherSidebar.tsx`, `CodeEditor.tsx`, `AgentSwarm.tsx`, `AgentCard.tsx`, `ConversationList.tsx`, `RightPanel.tsx`, `VoiceToggle.tsx`, `ImagePreview.tsx`
**New edge functions:** `aether-image-gen/index.ts`
**Modified:** `App.tsx`, `Index.tsx`, `index.css`, `tailwind.config.ts`, `emma-chat/index.ts` (rebrand prompt)
**Database:** Migration for profiles, conversations, messages tables + RLS + trigger

**New dependency:** `@monaco-editor/react`

## Phasing

I'll build this across multiple implementation rounds:
1. **Round 1:** DB + Auth + Layout + Sidebar + Persistent Chat (core foundation)
2. **Round 2:** Code Editor + Agent Swarm + Image Gen + Dashboard
3. **Round 3:** Voice mode + Branching + API scaffolding for E2B/GitHub/etc.

Ready to start with Round 1 on approval.


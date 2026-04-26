import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Brain, Search, Hammer, Mic, BarChart3, Code2, Image as ImageIcon, Eye,
  Cpu, Shield, Network, GitBranch, Database, Sparkles, ArrowRight,
  Workflow, Bot, Layers, Settings as SettingsIcon, KeyRound, BookOpen,
  HeartPulse, ChevronRight, Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmmaAvatar } from "@/components/EmmaAvatar";

import landingImg from "@/assets/docs/landing.png";
import workspaceChatImg from "@/assets/docs/workspace-chat.png";
import workspaceIdeImg from "@/assets/docs/workspace-ide.png";
import researchImg from "@/assets/docs/mode-research.png";
import agentImg from "@/assets/docs/mode-agent.png";
import memoryImg from "@/assets/docs/mode-memory.png";
import builderImg from "@/assets/docs/mode-builder.png";
import authImg from "@/assets/docs/auth-clerk.png";

type Section = {
  id: string;
  title: string;
  icon: React.ElementType;
  group: string;
};

const SECTIONS: Section[] = [
  { id: "intro", title: "Welcome", icon: Sparkles, group: "Getting Started" },
  { id: "signup", title: "Create an account", icon: KeyRound, group: "Getting Started" },
  { id: "workspace", title: "The workspace", icon: BookOpen, group: "Getting Started" },

  { id: "chat", title: "Chat", icon: Brain, group: "AI Modes" },
  { id: "research", title: "Deep Research", icon: Search, group: "AI Modes" },
  { id: "artifacts", title: "Artifacts", icon: Hammer, group: "AI Modes" },
  { id: "think", title: "Think", icon: Cpu, group: "AI Modes" },
  { id: "builder", title: "Builder", icon: Workflow, group: "AI Modes" },
  { id: "agent", title: "Computer-Use Agent", icon: Eye, group: "AI Modes" },
  { id: "voice", title: "Voice", icon: Mic, group: "AI Modes" },
  { id: "data", title: "Data", icon: BarChart3, group: "AI Modes" },
  { id: "memory", title: "Memory", icon: Database, group: "AI Modes" },
  { id: "projects", title: "Projects & IDE", icon: Code2, group: "AI Modes" },

  { id: "agents", title: "Multi-Agent Swarm", icon: Network, group: "Advanced" },
  { id: "benchmarks", title: "Benchmarks & Reports", icon: BarChart3, group: "Advanced" },
  { id: "dashboard", title: "Dashboard", icon: Cpu, group: "Advanced" },
  { id: "agi", title: "AGI Systems", icon: Brain, group: "Advanced" },
  { id: "safety", title: "Safety & Guardrails", icon: Shield, group: "Advanced" },
  { id: "github", title: "GitHub Sync", icon: GitBranch, group: "Advanced" },
  { id: "images", title: "Image Generation", icon: ImageIcon, group: "Advanced" },
  { id: "transfer", title: "Cross-Domain Transfer", icon: Layers, group: "Advanced" },

  { id: "settings", title: "Settings", icon: SettingsIcon, group: "Account" },
  { id: "api-keys", title: "API Keys", icon: KeyRound, group: "Account" },
  { id: "billing", title: "Membership & billing", icon: Sparkles, group: "Account" },

  { id: "carewallet", title: "Case Study: CareWalletNetwork.com", icon: HeartPulse, group: "Integrations" },
];

const GROUPS = Array.from(new Set(SECTIONS.map((s) => s.group)));

export default function Docs() {
  const [active, setActive] = useState<string>("intro");

  // Scroll-spy to highlight current section in TOC
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0.1, 0.5, 1] }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const grouped = useMemo(() => {
    return GROUPS.map((g) => ({
      group: g,
      items: SECTIONS.filter((s) => s.group === g),
    }));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground emma-soft-grid">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
          <Link to="/" className="flex items-center gap-2.5 group">
            <EmmaAvatar size="sm" />
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-wide">Emma <span className="text-muted-foreground font-normal">Intelligence</span></div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Documentation</div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Link to="/" className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition">Home</Link>
            <Link to="/app" className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition">Open App</Link>
            <Link to="/dashboard" className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition">Dashboard</Link>
          </nav>
          <Button asChild size="sm" variant="glow" className="text-xs">
            <Link to="/app">Launch Emma <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-8 lg:gap-12">
          {/* Sticky sidebar TOC */}
          <aside className="lg:sticky lg:top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 -mr-2 scrollbar-thin">
            <div className="space-y-6">
              {grouped.map(({ group, items }) => (
                <div key={group}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80 mb-2 px-2">
                    {group}
                  </div>
                  <ul className="space-y-0.5">
                    {items.map((s) => {
                      const isActive = active === s.id;
                      return (
                        <li key={s.id}>
                          <a
                            href={`#${s.id}`}
                            className={`group flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition ${
                              isActive
                                ? "bg-primary/15 text-foreground border border-primary/30"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40 border border-transparent"
                            }`}
                          >
                            <s.icon className={`h-3.5 w-3.5 ${isActive ? "text-primary" : ""}`} />
                            <span className="truncate">{s.title}</span>
                            {isActive && <ChevronRight className="ml-auto h-3 w-3 text-primary" />}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </aside>

          {/* Content */}
          <main className="min-w-0 space-y-16 lg:space-y-24">
            {/* Hero */}
            <Section id="intro" title="Welcome to Emma" eyebrow="Documentation" icon={Sparkles}>
              <p className="lead">
                Emma Intelligence is an autonomous AI workspace. She doesn’t just chat — she researches with citations,
                writes and executes code in a real Linux sandbox, builds React components live, talks back in real
                voice, drives a browser, and remembers everything you do across sessions. This walkthrough covers
                <span className="text-foreground"> every feature</span> in the order you’ll meet them.
              </p>
              <Figure src={landingImg} caption="The Emma Intelligence landing page at emma-intelligence.lovable.app." />
              <Callout title="Three things to know">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Modes are tabs.</strong> Switch what Emma does — Chat, Research, Builder, Agent, Voice, Data, Memory, Projects — without losing context.</li>
                  <li><strong>The right panel is contextual.</strong> Sources, thoughts, tools, memory and live status appear next to your conversation.</li>
                  <li><strong>The floating chat is everywhere.</strong> A persistent assistant button (bottom-right) follows you into the IDE, Dashboard and Settings.</li>
                </ul>
              </Callout>
            </Section>

            {/* Signup */}
            <Section id="signup" title="Create an account" eyebrow="Getting Started" icon={KeyRound}>
              <p>
                Click <em>Get Started</em> on the landing page. Sign-in is handled by Clerk and supports email,
                Google, GitHub, Discord, Facebook, X, and LinkedIn. After signup you’re routed straight into the
                workspace at <code>/app</code>.
              </p>
              <Figure src={authImg} caption="The Clerk sign-in modal — pick any provider or use email." />
              <Steps steps={[
                "Click Get Started or Sign in (top right of the landing page).",
                "Choose a provider, or enter your email and click Continue.",
                "On first visit Emma seeds an empty conversation and an empty Project for you.",
                "You arrive in the workspace — start typing in any mode.",
              ]} />
            </Section>

            {/* Workspace */}
            <Section id="workspace" title="The workspace" eyebrow="Getting Started" icon={BookOpen}>
              <p>
                The workspace is split into three regions: a <strong>left rail</strong> with conversations, tools and account
                links; a <strong>center column</strong> with the active mode and chat input; and a <strong>right panel</strong> that adapts
                to whatever Emma is doing — sources, thoughts, tool calls, memory, or live status.
              </p>
              <Figure src={workspaceChatImg} caption="The default workspace in Chat mode. Mode tabs across the top, suggestion tiles in the center, contextual right panel." />
              <SubHeading>The mode tabs</SubHeading>
              <p>
                The horizontal pill bar at the top is the heart of Emma. Each mode is a different lens on the same
                conversation — switch freely, your messages stay.
              </p>
              <SubHeading>Answer styles</SubHeading>
              <p>
                In the top-right you can set the response style: <em>Concise</em> (one paragraph), <em>Standard</em> (default),
                <em> Deep</em> (long-form, multi-section), or <em>Direct</em> (no preamble).
              </p>
            </Section>

            {/* Chat */}
            <Section id="chat" title="Chat" eyebrow="AI Modes" icon={Brain}>
              <p>
                Chat is general-purpose conversation. Emma streams tokens in real time, shows her sources in the right
                panel, and stores every message in your conversation history. Use slash commands like
                <code> /image a futuristic city</code> to generate images inline.
              </p>
              <Figure src={workspaceChatImg} caption="Chat mode with the four starter suggestions." />
              <SubHeading>What the right panel shows</SubHeading>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Sources</strong> — citations Emma used for the current response.</li>
                <li><strong>Thoughts</strong> — internal reasoning when extended thinking is enabled.</li>
                <li><strong>Tools</strong> — function calls Emma made (web search, code exec, image gen).</li>
                <li><strong>Memory</strong> — episodic memories pulled in for this turn.</li>
                <li><strong>Status</strong> — live system metrics (latency, model, tokens).</li>
              </ul>
            </Section>

            {/* Research */}
            <Section id="research" title="Deep Research" eyebrow="AI Modes" icon={Search}>
              <p>
                Research mode runs a multi-step plan: it decomposes your objective, searches the web in parallel,
                reads sources, and synthesizes a structured report with inline citations. Reports include a summary,
                the full long-form answer, open questions, and a confidence score.
              </p>
              <Figure src={researchImg} caption="Deep Research panel — enter an objective and Emma plans, searches and synthesizes a cited report." />
              <Steps steps={[
                "Switch to Research mode.",
                "Type a research objective in the right-panel search box (e.g. 'state of fusion startups in 2026').",
                "Watch Emma plan → search → analyze → synthesize.",
                "Open citations, copy the report, or save it as an Artifact.",
              ]} />
            </Section>

            {/* Artifacts */}
            <Section id="artifacts" title="Artifacts" eyebrow="AI Modes" icon={Hammer}>
              <p>
                Artifacts are versioned generated assets — markdown docs, code files, HTML, React components, plans,
                reports, tables, prompts. Every artifact keeps a full history so you can roll back, diff, or fork.
              </p>
              <SubHeading>Creating one</SubHeading>
              <p>
                In any mode, ask Emma to <em>“write a one-page brief about X”</em> or <em>“build a React pricing card”</em>
                and the result lands as an artifact. Open it from the right panel to edit, copy, download or version.
              </p>
            </Section>

            {/* Think */}
            <Section id="think" title="Think" eyebrow="AI Modes" icon={Cpu}>
              <p>
                Think mode unlocks Emma’s extended reasoning. She’ll spend more compute internally, expose her
                thought process in the right panel, and is the right choice for math proofs, intricate logic,
                multi-step planning and detailed code analysis.
              </p>
            </Section>

            {/* Builder */}
            <Section id="builder" title="Builder" eyebrow="AI Modes" icon={Workflow}>
              <p>
                Builder is Emma’s autonomous task runner. Describe a multi-step goal — “draft a competitive analysis,
                pull pricing from three sites, then turn it into a slide deck” — and she plans, executes, logs every
                step, and delivers the artifacts at the end.
              </p>
              <Figure src={builderImg} caption="Autonomous Builder — multi-step task planning with live execution log." />
            </Section>

            {/* Agent */}
            <Section id="agent" title="Computer-Use Agent" eyebrow="AI Modes" icon={Eye}>
              <p>
                The Computer-Use Agent spins up an isolated virtual desktop and operates a real browser to complete
                tasks end-to-end — fill forms, scrape pages, click through flows. Use the <em>Scope</em> button to
                restrict which domains it’s allowed to touch.
              </p>
              <Figure src={agentImg} caption="Computer-Use Agent — describe an end-to-end task, set a scope, and start." />
              <Callout tone="warn" title="Safety scope">
                The agent will refuse to navigate outside your declared scope. There is no “bypass” — this is enforced
                at the sandbox level so credentials, payments and destructive actions are protected by default.
              </Callout>
            </Section>

            {/* Voice */}
            <Section id="voice" title="Voice" eyebrow="AI Modes" icon={Mic}>
              <p>
                Voice gives you real-time spoken conversation. Tap the mic, speak naturally, and Emma responds with a
                streamed ElevenLabs voice. Great for hands-free brainstorming or driving the system from a phone.
              </p>
            </Section>

            {/* Data */}
            <Section id="data" title="Data" eyebrow="AI Modes" icon={BarChart3}>
              <p>
                Drop a CSV, Excel or JSON file into the chat. Emma profiles the data (column types, distributions,
                missing values), suggests questions, and generates charts and a written insight report.
              </p>
              <Steps steps={[
                "Switch to Data mode.",
                "Click the paperclip and upload your file.",
                "Ask a question or accept one of the auto-suggested ones.",
                "Charts and insights appear inline; export the report as an Artifact.",
              ]} />
            </Section>

            {/* Memory */}
            <Section id="memory" title="Memory" eyebrow="AI Modes" icon={Database}>
              <p>
                Memory mode is Emma’s long-term store. She automatically saves important facts during conversations,
                and you can manually <em>Remember</em> anything (preferences, project context, key decisions). The
                memory is searchable and filtered by tag.
              </p>
              <Figure src={memoryImg} caption="Memory Control — search, tag, add and remove what Emma remembers about you." />
            </Section>

            {/* Projects / IDE */}
            <Section id="projects" title="Projects & IDE" eyebrow="AI Modes" icon={Code2}>
              <p>
                Projects mode is a full in-browser IDE: VS Code-style activity bar, file explorer, Monaco editor,
                terminal connected to a real Linux sandbox, GitHub source control panel, and a floating Emma assistant
                that can edit the active file directly.
              </p>
              <Figure src={workspaceIdeImg} caption="The Projects IDE — explorer, editor, source control and run/terminal in one screen." />
              <SubHeading>Activity bar</SubHeading>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Explorer</strong> — project switcher above, file tree below, expandable folders persisted across sessions.</li>
                <li><strong>Search</strong> — full-text search across the entire project.</li>
                <li><strong>Source Control</strong> — connect a repo, stage, commit and push without leaving the IDE.</li>
                <li><strong>Extensions</strong> — built-in capabilities (Emma assistant, Sandbox VM, GitHub Sync, ZIP import/export, auto-save).</li>
              </ul>
              <SubHeading>The floating chat</SubHeading>
              <p>
                The drag-anywhere assistant in the bottom-right is context-aware. It knows your active file, can
                propose edits, and can apply them straight back into the editor.
              </p>
            </Section>

            {/* Multi-agent */}
            <Section id="agents" title="Multi-Agent Swarm" eyebrow="Advanced" icon={Network}>
              <p>
                For complex tasks Emma spawns specialist sub-agents — researcher, coder, critic, planner — that
                collaborate, review each other and converge on a single deliverable. Open the Agents page from the
                left rail to inspect the swarm in real time.
              </p>
            </Section>

            {/* Benchmarks */}
            <Section id="benchmarks" title="Benchmarks & Reports" eyebrow="Advanced" icon={BarChart3}>
              <p>
                Emma evaluates herself across <strong>Reasoning, Coding, Planning and MMLU</strong>. Each run produces an
                Intelligence Score, per-category breakdown, qualitative verdict and the question-by-question detail.
                Click <em>Report</em> in the Benchmark panel to download a Markdown report you can read or share.
              </p>
            </Section>

            {/* Dashboard */}
            <Section id="dashboard" title="Dashboard" eyebrow="Advanced" icon={Cpu}>
              <p>
                The Dashboard at <code>/dashboard</code> is your command-deck view: glass stat cards, charts of recent
                activity, and the System Status & Roadmap widget showing what’s shipped, in progress and next.
              </p>
            </Section>

            {/* AGI */}
            <Section id="agi" title="AGI Systems" eyebrow="Advanced" icon={Brain}>
              <p>
                The AGI page is a live readout of Emma’s inner loops — autonomous goal generation, world-model
                updates, metacognitive scoring, safety verifications and self-improvement deltas. This is where
                you’ll see Emma rewrite her own prompts every 15 minutes when the benchmark gate passes.
              </p>
            </Section>

            {/* Safety */}
            <Section id="safety" title="Safety & Guardrails" eyebrow="Advanced" icon={Shield}>
              <p>
                Every action is screened by a formal safety layer with CVSS-style risk scoring, adversarial
                red-teaming, and provable constraint enforcement. High-risk actions are blocked outright; medium-risk
                ones are logged with a written justification.
              </p>
            </Section>

            {/* GitHub */}
            <Section id="github" title="GitHub Sync" eyebrow="Advanced" icon={GitBranch}>
              <p>
                Connect a repository on a project (Source Control panel in the IDE) and Emma can pull, commit and push
                on your behalf. Self-improvements are committed as PRs against Emma’s own repo, gated by CI and the
                benchmark check.
              </p>
            </Section>

            {/* Images */}
            <Section id="images" title="Image Generation" eyebrow="Advanced" icon={ImageIcon}>
              <p>
                Type <code>/image &lt;prompt&gt;</code> in any mode, or ask Emma to “make a hero image for…”. She uses
                the latest Gemini 3 Pro Image and Nano Banana models for hero art, logos, product shots and edits.
              </p>
            </Section>

            {/* Transfer */}
            <Section id="transfer" title="Cross-Domain Transfer" eyebrow="Advanced" icon={Layers}>
              <p>
                Knowledge Emma learns in one domain transfers to others through embedding-grounded analogy. A pattern
                discovered while writing TypeScript will surface when reasoning about a clinical workflow, and vice
                versa.
              </p>
            </Section>

            {/* Settings */}
            <Section id="settings" title="Settings" eyebrow="Account" icon={SettingsIcon}>
              <p>
                Update your display name and avatar, choose your default mode, set the answer style, configure voice
                output, and manage notifications. Settings is at <code>/settings</code> from the left rail.
              </p>
            </Section>

            {/* API Keys */}
            <Section id="api-keys" title="API Keys" eyebrow="Account" icon={KeyRound}>
              <p>
                Generate API keys at <code>/api-keys</code> to call Emma from your own apps. Keys are hashed at rest,
                shown only once on creation, and can be revoked anytime.
              </p>
            </Section>

            {/* Billing */}
            <Section id="billing" title="Membership & billing" eyebrow="Account" icon={Sparkles}>
              <p>
                The free tier includes 25 messages. Membership ($12/month) unlocks unlimited messages across every
                mode. Pay via Cash App to <code>$mycashdirect2022</code> with the unique reference code shown at
                checkout — access unlocks instantly.
              </p>
            </Section>

            {/* CareWallet case study */}
            <Section id="carewallet" title="Case Study: CareWalletNetwork.com" eyebrow="Integrations" icon={HeartPulse}>
              <p className="lead">
                CareWallet is a healthcare rewards network that pays clinicians in <strong>CARE tokens</strong> for every
                verified clinical documentation event — encounter notes, discharge summaries, medication
                reconciliation, preventive care. We loaded a project for it inside Emma so you can use it as a
                worked example of how Emma integrates with a real-world domain.
              </p>

              <SubHeading>What CareWallet actually is</SubHeading>
              <p>
                CareWallet sits between an EHR and a Polygon-based reward ledger. Providers do the documentation they
                already do; an oracle attests the event; a smart contract mints the corresponding CARE tokens; the
                provider can cash out to USD instantly. The pitch on carewalletnetwork.com is simple:
                <em> “Get paid more for the care you already deliver.”</em>
              </p>

              <SubHeading>Earnings model</SubHeading>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Discharge Summary</strong> — 1,500 CARE ($9.00 at $0.01/CARE, 60% provider split)</li>
                <li><strong>Preventive Care</strong> — 1,200 CARE ($7.20)</li>
                <li><strong>Encounter Note</strong> — 1,000 CARE ($6.00)</li>
                <li><strong>Coding Finalized</strong> — 800 CARE ($4.80)</li>
                <li><strong>Med Reconciliation</strong> — 750 CARE ($4.50)</li>
                <li><strong>Orders Verified</strong> — 600 CARE ($3.60)</li>
              </ul>
              <p>
                A provider documenting 80–100 events per day clears <strong>$400–$800+/day</strong>, well above traditional RN,
                therapist or even physician hourly rates.
              </p>

              <SubHeading>The CARE ecosystem split</SubHeading>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>60% — Providers.</strong> The largest share for the people doing the work.</li>
                <li><strong>30% — Organizations.</strong> Practices and health systems share in supporting quality documentation.</li>
                <li><strong>10% — Patients.</strong> Patients earn CARE for consent, intake and follow-ups.</li>
              </ul>

              <SubHeading>Why it’s HIPAA-safe</SubHeading>
              <p>
                Only de-identified hashes are written on-chain. PHI never leaves the EHR. Oracle attestations confirm
                that an event of a given type happened, without revealing patient details. This is the pattern Emma
                follows for any healthcare integration: hashes on-chain, records off-chain.
              </p>

              <SubHeading>Using it inside Emma</SubHeading>
              <p>
                Open <strong>Projects</strong> in the workspace and you’ll find a project named
                <em> CareWalletNetwork</em>. It includes a README with the site overview, the earnings table and the
                ecosystem split — a starting point for prompting Emma about provider rewards, oracle design,
                tokenomics or HIPAA-style architecture without re-pasting context every time.
              </p>

              <Callout tone="info" title="Try it yourself">
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Launch the app and switch to <strong>Projects</strong>.</li>
                  <li>Open the <em>CareWalletNetwork</em> project.</li>
                  <li>Open <code>README.md</code> in the editor.</li>
                  <li>Ask the floating chat: <em>“Design an oracle for verifying discharge summaries.”</em></li>
                </ol>
              </Callout>
              <p className="text-sm text-muted-foreground">
                Source: <a className="underline hover:text-foreground" href="https://carewalletnetwork.com" target="_blank" rel="noreferrer">carewalletnetwork.com</a>
              </p>
            </Section>

            {/* CTA */}
            <div className="emma-card p-8 text-center">
              <Folder className="h-8 w-8 mx-auto mb-3 text-primary" />
              <h3 className="text-xl font-semibold mb-2">Ready to drive Emma yourself?</h3>
              <p className="text-sm text-muted-foreground mb-5 max-w-xl mx-auto">
                Open the workspace and pick a mode. Everything in this guide is one click away.
              </p>
              <Button asChild variant="glow">
                <Link to="/app">Open the app <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
              </Button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function Section({
  id, title, eyebrow, icon: Icon, children,
}: { id: string; title: string; eyebrow: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-[0.22em] text-primary/80 mb-2 flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" /> {eyebrow}
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h2>
      </div>
      <div className="prose-emma space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">{children}</h3>;
}

function Figure({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="my-6 emma-card overflow-hidden">
      <img src={src} alt={caption} className="w-full h-auto block" loading="lazy" />
      <figcaption className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border/60 bg-card/40">
        {caption}
      </figcaption>
    </figure>
  );
}

function Callout({
  title, children, tone = "info",
}: { title: string; children: React.ReactNode; tone?: "info" | "warn" }) {
  const ring =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/5"
      : "border-primary/30 bg-primary/5";
  return (
    <div className={`my-6 rounded-2xl border ${ring} p-4 sm:p-5`}>
      <div className="text-sm font-semibold text-foreground mb-1.5">{title}</div>
      <div className="text-sm text-muted-foreground space-y-2">{children}</div>
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="my-5 space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 items-start text-sm">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 border border-primary/30 text-primary text-[11px] font-semibold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-muted-foreground pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

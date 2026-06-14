import { Link } from "react-router-dom";
import { ArrowLeft, Eye, Shield, Sparkles, Brain, Code2, Search, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import emmaLogo from "@/assets/emma-logo.png";

// Static, read-only demo transcript for safe external presentations (e.g. OpenAI review).
// No network calls, no input, no auth required.

interface Turn {
  role: "user" | "emma";
  mode?: string;
  content: string;
  meta?: string;
}

const TRANSCRIPT: Turn[] = [
  {
    role: "user",
    content: "Emma, plan a 4-week roadmap to ship a real-time collaborative whiteboard with CRDT sync.",
  },
  {
    role: "emma",
    mode: "Planner",
    content:
      "Decomposed into 4 phases: (1) CRDT core (Yjs) + persistence, (2) WebRTC + WebSocket fallback transport, (3) Canvas renderer with offscreen workers, (4) Presence + permissions. Critical path: transport layer — 9 dev-days. I generated 23 stories across 4 epics, estimated 47 points, with acceptance criteria and test plans for each.",
    meta: "47 points · 23 stories · 4 epics",
  },
  {
    role: "user",
    content: "Switch to Research mode. Find recent CRDT benchmarks vs OT.",
  },
  {
    role: "emma",
    mode: "Research",
    content:
      "Surveyed 14 sources (2023–2026). Key findings: Yjs outperforms Automerge by ~3.2× on large doc merges; OT remains lower-latency for single-cursor text but loses on branching topologies. Cited: Kleppmann '23, Nicolaescu '24, Riak benchmark suite. Full citation graph attached.",
    meta: "14 sources · 6 citations verified",
  },
  {
    role: "user",
    content: "Now build a minimal Yjs + React prototype.",
  },
  {
    role: "emma",
    mode: "Builder",
    content:
      "Scaffolded prototype: Vite + React 18 + y-websocket + tldraw renderer. Generated 11 files, ran unit tests (12/12 passing), and opened a sandbox preview. Self-review pass identified one race condition in the awareness handler — patched and re-verified.",
    meta: "11 files · 12/12 tests · 1 self-correction",
  },
  {
    role: "user",
    content: "What's your current self-improvement status?",
  },
  {
    role: "emma",
    mode: "Meta",
    content:
      "Last cycle: 14 minutes ago. Improved planner prompt (+4.1% on HELM-Plan), retired one weak retrieval heuristic, shipped to GitHub as commit a8f3c1d. Next cycle in 1 minute. Constitution + safety classifier ran on every change — zero policy violations this week.",
    meta: "Cycle 8,412 · +4.1% planner score",
  },
];

const MODE_ICONS: Record<string, any> = {
  Planner: Sparkles,
  Research: Search,
  Builder: Code2,
  Meta: Brain,
};

export default function Demo() {
  return (
    <div className="min-h-screen bg-background">
      {/* Read-only banner */}
      <div className="sticky top-0 z-40 border-b border-amber-500/30 bg-amber-500/10 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 text-amber-200">
            <Shield className="h-3.5 w-3.5" />
            <span className="font-medium uppercase tracking-wider">Read-only demo</span>
            <span className="hidden sm:inline text-amber-200/70">
              · Pre-recorded transcript · No live model calls · Safe for external review
            </span>
          </div>
          <Link to="/" className="text-amber-200/80 hover:text-amber-100 flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back
          </Link>
        </div>
      </div>

      {/* Header */}
      <header className="max-w-6xl mx-auto px-6 pt-10 pb-6 flex items-center gap-4">
        <img src={emmaLogo} alt="Emma" className="w-12 h-12 rounded-xl object-cover" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Emma — Capability Walkthrough</h1>
          <p className="text-sm text-muted-foreground">
            A static snapshot of a real Emma session, frozen for safe demonstration.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-300">
          <Eye className="h-3 w-3" /> View only
        </Badge>
      </header>

      {/* Transcript */}
      <main className="max-w-3xl mx-auto px-6 pb-16 space-y-4">
        {TRANSCRIPT.map((t, i) => {
          if (t.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/15 border border-primary/20 px-4 py-3 text-sm">
                  {t.content}
                </div>
              </div>
            );
          }
          const Icon = MODE_ICONS[t.mode || ""] || Bot;
          return (
            <Card key={i} className="p-4 border-border/60">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-sm font-medium">Emma</span>
                {t.mode && (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                    {t.mode}
                  </Badge>
                )}
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{t.content}</p>
              {t.meta && (
                <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground font-mono">
                  {t.meta}
                </div>
              )}
            </Card>
          );
        })}

        {/* Disabled input */}
        <div className="pt-4">
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-4 text-center text-sm text-muted-foreground select-none">
            Input disabled — this is a read-only demonstration.
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/">
            <Button variant="outline">Back to home</Button>
          </Link>
          <Link to="/capabilities">
            <Button variant="ghost">View full capability list</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

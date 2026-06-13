import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles } from "lucide-react";

interface Entry {
  date: string;
  title: string;
  tags: string[];
  bullets: string[];
}

const ENTRIES: Entry[] = [
  {
    date: "2026-06-13",
    title: "Homepage promises made real",
    tags: ["Pages", "Routing"],
    bullets: [
      "New /swarm page — Multi-Agent Swarm (Builder · Critic · Skeptic · Inventor) wired to emma-multi-agent.",
      "New /safety page — Formal Safety Layer with deterministic invariants, risk scoring and audit history.",
      "New /transfer page — Cross-Domain Transfer: extract abstractions, apply them to new domains.",
      "New /images page — Image Studio using Gemini 3 Pro Image with download support.",
      "Landing feature cards now link directly to their delivering pages.",
    ],
  },
  {
    date: "2026-06-13",
    title: "Physics Inventions polish",
    tags: ["Inventions"],
    bullets: [
      "Optional prompt added when manually requesting an invention.",
      "Build instructions field generated and shown per invention.",
      "Fixed “[object Object]” rendering on build instructions.",
    ],
  },
  {
    date: "2026-06-12",
    title: "Computer-Use Agent accuracy",
    tags: ["Agent"],
    bullets: [
      "Improved click coordinate accuracy and DOM-anchored fallbacks.",
      "Better screenshot loop scheduling and error recovery.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Project IDE foundations",
    tags: ["IDE"],
    bullets: [
      "Real Monaco editor with multi-tab and multi-pane layouts.",
      "E2B-backed terminal and code runner (Python · Node · TS · Bash · Go).",
      "GitHub commit / push / pull through emma-github edge function.",
      "Debounced auto-save and AI apply-to-file from chat.",
    ],
  },
];

export default function Changelog() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <Sparkles className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Changelog</h1>
            <p className="text-xs text-muted-foreground">What’s new in Emma</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        {ENTRIES.map((e, i) => (
          <Card key={i} className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{e.title}</h2>
              <span className="text-xs text-muted-foreground">{e.date}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {e.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              {e.bullets.map((b, j) => <li key={j}>{b}</li>)}
            </ul>
          </Card>
        ))}
      </main>
    </div>
  );
}

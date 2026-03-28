import { MessageSquare, Search, FileCode2, Mic, Wrench, Brain, Database, BarChart3 } from "lucide-react";
import type { EmmaMode } from "@/lib/emma-stream";

const MODES: { id: EmmaMode; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, desc: "General assistant" },
  { id: "research", label: "Research", icon: Search, desc: "Deep research with citations" },
  { id: "artifacts", label: "Artifacts", icon: FileCode2, desc: "Create & edit documents" },
  { id: "think", label: "Think", icon: Brain, desc: "Planning & reasoning" },
  { id: "builder", label: "Builder", icon: Wrench, desc: "Autonomous tasks" },
  { id: "voice", label: "Voice", icon: Mic, desc: "Live conversation" },
  { id: "data", label: "Data", icon: BarChart3, desc: "Analyze files & data" },
  { id: "memory", label: "Memory", icon: Database, desc: "Context & recall" },
];

interface ModeSwitcherProps {
  mode: EmmaMode;
  onChange: (mode: EmmaMode) => void;
  compact?: boolean;
}

export function ModeSwitcher({ mode, onChange, compact = false }: ModeSwitcherProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            title={`${m.label}: ${m.desc}`}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
              mode === m.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
          >
            <m.icon className="h-3 w-3" />
            {m.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 p-1 bg-secondary/30 rounded-xl">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            mode === m.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          }`}
        >
          <m.icon className="h-3.5 w-3.5" />
          {m.label}
        </button>
      ))}
    </div>
  );
}

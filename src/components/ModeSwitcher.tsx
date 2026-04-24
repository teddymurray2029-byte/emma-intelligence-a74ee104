import { MessageSquare, Search, FileCode2, Mic, Wrench, Brain, Database, BarChart3, FolderKanban, Monitor } from "lucide-react";
import type { EmmaMode } from "@/lib/emma-stream";

const MODES: { id: EmmaMode; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, desc: "General assistant" },
  { id: "research", label: "Research", icon: Search, desc: "Deep research with citations" },
  { id: "artifacts", label: "Artifacts", icon: FileCode2, desc: "Create & edit documents" },
  { id: "think", label: "Think", icon: Brain, desc: "Planning & reasoning" },
  { id: "builder", label: "Builder", icon: Wrench, desc: "Autonomous tasks" },
  { id: "agent", label: "Agent", icon: Monitor, desc: "Computer-use agent with virtual OS" },
  { id: "projects", label: "Projects", icon: FolderKanban, desc: "IDE & source control" },
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
      <div className="flex items-center gap-1 -mx-1 px-1 overflow-x-auto scrollbar-none snap-x">
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              title={`${m.label}: ${m.desc}`}
              className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium snap-start flex-shrink-0 transition-all duration-200 ${
                active
                  ? "emma-tab-active text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 hover:-translate-y-px"
              }`}
            >
              <m.icon className={`h-3 w-3 transition-transform duration-200 ${active ? "text-primary" : "group-hover:scale-110 group-hover:rotate-3"}`} />
              {m.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 p-1 emma-glass rounded-2xl overflow-x-auto scrollbar-none">
      {MODES.map((m) => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 flex-shrink-0 ${
              active
                ? "emma-tab-active"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40 hover:-translate-y-px"
            }`}
          >
            <m.icon className={`h-3.5 w-3.5 transition-transform duration-200 ${active ? "text-primary" : "group-hover:scale-110 group-hover:rotate-3"}`} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

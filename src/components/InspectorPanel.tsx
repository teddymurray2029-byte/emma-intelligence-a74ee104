import { useState } from "react";
import { Eye, BookOpen, Brain, Wrench, Target, Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Citation } from "@/lib/emma-stream";

interface InspectorPanelProps {
  citations?: Citation[];
  thoughts?: string[];
  toolsUsed?: string[];
  memoryHits?: string[];
  taskStatus?: string;
  isProcessing?: boolean;
}

type InspectorTab = "sources" | "thoughts" | "tools" | "memory" | "status";

export function InspectorPanel({
  citations = [],
  thoughts = [],
  toolsUsed = [],
  memoryHits = [],
  taskStatus,
  isProcessing,
}: InspectorPanelProps) {
  const [tab, setTab] = useState<InspectorTab>("sources");

  const tabs: { id: InspectorTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "sources", label: "Sources", icon: BookOpen, count: citations.length },
    { id: "thoughts", label: "Thoughts", icon: Brain, count: thoughts.length },
    { id: "tools", label: "Tools", icon: Wrench, count: toolsUsed.length },
    { id: "memory", label: "Memory", icon: Target, count: memoryHits.length },
    { id: "status", label: "Status", icon: Activity },
  ];

  return (
    <div className="flex flex-col h-full bg-card/50 border-l border-border">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3 w-3" />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="text-[8px] bg-primary/20 text-primary px-1 rounded-full">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {tab === "sources" && (
            citations.length > 0 ? (
              citations.map((c) => (
                <div key={c.id} className="emma-surface-elevated rounded-lg p-2 space-y-1">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-mono text-primary font-bold">[{c.id}]</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium text-foreground">{c.title}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{c.snippet}</p>
                      {c.url && <p className="text-[9px] text-primary/60 truncate mt-0.5">{c.url}</p>}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-muted-foreground text-center py-4">No sources for current response</p>
            )
          )}

          {tab === "thoughts" && (
            thoughts.length > 0 ? (
              thoughts.map((t, i) => (
                <p key={i} className="text-[10px] text-muted-foreground font-mono">▸ {t}</p>
              ))
            ) : (
              <p className="text-[10px] text-muted-foreground text-center py-4">No reasoning trace available</p>
            )
          )}

          {tab === "tools" && (
            toolsUsed.length > 0 ? (
              toolsUsed.map((t, i) => (
                <div key={i} className="emma-surface-elevated rounded-lg p-2 flex items-center gap-2">
                  <Wrench className="h-3 w-3 text-accent flex-shrink-0" />
                  <p className="text-[10px] text-foreground">{t}</p>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-muted-foreground text-center py-4">No tools used</p>
            )
          )}

          {tab === "memory" && (
            memoryHits.length > 0 ? (
              memoryHits.map((m, i) => (
                <div key={i} className="emma-surface-elevated rounded-lg p-2">
                  <p className="text-[10px] text-foreground">{m}</p>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-muted-foreground text-center py-4">No memory hits</p>
            )
          )}

          {tab === "status" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isProcessing ? "bg-primary emma-pulse" : "bg-green-400"}`} />
                <span className="text-[10px] font-mono text-foreground">{isProcessing ? "PROCESSING" : "IDLE"}</span>
              </div>
              {taskStatus && (
                <p className="text-[10px] text-muted-foreground">{taskStatus}</p>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

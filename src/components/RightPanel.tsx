import { useState } from "react";
import { Code2, Bot, Target, Database } from "lucide-react";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { AgentSwarm } from "./AgentSwarm";
import { BenchmarkPanel } from "./BenchmarkPanel";
import { MemoryPanel } from "./MemoryPanel";
import { ScrollArea } from "./ui/scroll-area";

type Tab = "ide" | "agents" | "bench" | "memory";

interface RightPanelProps {
  isProcessing?: boolean;
  editorRef?: React.RefObject<CodeEditorHandle | null>;
}

export function RightPanel({ isProcessing = false, editorRef }: RightPanelProps) {
  const [tab, setTab] = useState<Tab>("ide");

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "ide", label: "IDE", icon: Code2 },
    { id: "agents", label: "Agents", icon: Bot },
    { id: "bench", label: "Bench", icon: Target },
    { id: "memory", label: "Memory", icon: Database },
  ];

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      <div className="flex items-center border-b border-border bg-card">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.id === "agents" && isProcessing && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "ide" && <CodeEditor ref={editorRef} />}
        {tab === "agents" && <AgentSwarm isProcessing={isProcessing} />}
        {tab === "bench" && (
          <ScrollArea className="h-full">
            <div className="p-4"><BenchmarkPanel /></div>
          </ScrollArea>
        )}
        {tab === "memory" && (
          <ScrollArea className="h-full">
            <div className="p-4"><MemoryPanel /></div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

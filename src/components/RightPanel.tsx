import { useState } from "react";
import { Code2, Bot, BarChart3 } from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { AgentSwarm } from "./AgentSwarm";

type Tab = "ide" | "agents" | "preview";

export function RightPanel() {
  const [tab, setTab] = useState<Tab>("ide");

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "ide", label: "IDE", icon: Code2 },
    { id: "agents", label: "Agents", icon: Bot },
  ];

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border bg-card">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "ide" && <CodeEditor />}
        {tab === "agents" && <AgentSwarm />}
      </div>
    </div>
  );
}

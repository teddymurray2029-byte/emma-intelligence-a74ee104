import { motion } from "framer-motion";
import { Brain, Code2, Palette, Search, Shield, Cpu } from "lucide-react";

interface Agent {
  name: string;
  role: string;
  icon: React.ElementType;
  status: "idle" | "thinking" | "active" | "done";
  task?: string;
}

const AGENTS: Agent[] = [
  { name: "Director", role: "Orchestration", icon: Cpu, status: "active", task: "Coordinating sub-agents" },
  { name: "Researcher", role: "Knowledge", icon: Search, status: "idle" },
  { name: "Coder", role: "Engineering", icon: Code2, status: "idle" },
  { name: "Designer", role: "UX/UI", icon: Palette, status: "idle" },
  { name: "Analyst", role: "Data", icon: Brain, status: "idle" },
  { name: "QA", role: "Testing", icon: Shield, status: "idle" },
];

const statusColors: Record<string, string> = {
  idle: "bg-muted-foreground/30",
  thinking: "bg-accent animate-pulse",
  active: "bg-primary emma-pulse",
  done: "bg-green-500",
};

export function AgentSwarm() {
  return (
    <div className="h-full flex flex-col bg-background p-4 overflow-auto">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        Agent Swarm
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {AGENTS.map((agent, i) => (
          <motion.div
            key={agent.name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.08 }}
            className="emma-surface-elevated emma-glow-border rounded-xl p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <agent.icon className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-foreground">{agent.name}</span>
              <div className={`ml-auto w-2 h-2 rounded-full ${statusColors[agent.status]}`} />
            </div>
            <p className="text-[10px] text-muted-foreground">{agent.role}</p>
            {agent.task && (
              <p className="text-[10px] text-primary/80 font-mono truncate">{agent.task}</p>
            )}
          </motion.div>
        ))}
      </div>

      <div className="mt-6 p-3 emma-surface-elevated rounded-xl border border-border">
        <p className="text-xs text-muted-foreground mb-2 font-mono">SWARM LOG</p>
        <div className="space-y-1 text-[11px] font-mono text-muted-foreground">
          <p><span className="text-primary">▸</span> Director initialized</p>
          <p><span className="text-muted-foreground/50">▸</span> Awaiting task assignment...</p>
        </div>
      </div>
    </div>
  );
}

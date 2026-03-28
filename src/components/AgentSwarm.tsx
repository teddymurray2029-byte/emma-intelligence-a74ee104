import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Brain, Code2, Palette, Search, Shield, Cpu } from "lucide-react";

interface Agent {
  name: string;
  role: string;
  icon: React.ElementType;
  status: "idle" | "thinking" | "active" | "done";
  task?: string;
}

const BASE_AGENTS: Omit<Agent, "status" | "task">[] = [
  { name: "Director", role: "Orchestration", icon: Cpu },
  { name: "Researcher", role: "Knowledge", icon: Search },
  { name: "Coder", role: "Engineering", icon: Code2 },
  { name: "Designer", role: "UX/UI", icon: Palette },
  { name: "Analyst", role: "Data", icon: Brain },
  { name: "QA", role: "Testing", icon: Shield },
];

const TASKS: Record<string, string[]> = {
  Director: ["Coordinating sub-agents", "Planning execution", "Reviewing outputs"],
  Researcher: ["Searching knowledge base", "Analyzing context", "Gathering references"],
  Coder: ["Generating code", "Refactoring solution", "Running analysis"],
  Designer: ["Evaluating layout", "Checking accessibility", "Optimizing UX"],
  Analyst: ["Processing data", "Building models", "Generating insights"],
  QA: ["Validating output", "Testing edge cases", "Quality check"],
};

const statusColors: Record<string, string> = {
  idle: "bg-muted-foreground/30",
  thinking: "bg-accent animate-pulse",
  active: "bg-primary emma-pulse",
  done: "bg-green-500",
};

interface AgentSwarmProps {
  isProcessing?: boolean;
}

export function AgentSwarm({ isProcessing = false }: AgentSwarmProps) {
  const [agents, setAgents] = useState<Agent[]>(
    BASE_AGENTS.map((a) => ({ ...a, status: "idle" as const }))
  );
  const [logs, setLogs] = useState<string[]>(["Director initialized", "Awaiting task assignment..."]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isProcessing) {
      // Activate Director immediately
      setAgents((prev) =>
        prev.map((a) =>
          a.name === "Director"
            ? { ...a, status: "active", task: "Coordinating sub-agents" }
            : a
        )
      );
      setLogs(["Director activated", "Dispatching to sub-agents..."]);

      let tick = 0;
      intervalRef.current = setInterval(() => {
        tick++;
        setAgents((prev) =>
          prev.map((a) => {
            if (a.name === "Director") return { ...a, status: "active", task: TASKS.Director[tick % TASKS.Director.length] };
            // Cycle agents through states
            const agentIdx = BASE_AGENTS.findIndex((b) => b.name === a.name);
            const activateAt = agentIdx; // stagger by index
            const doneAt = activateAt + 3;
            if (tick >= activateAt && tick < doneAt) {
              const tasks = TASKS[a.name] || ["Processing..."];
              return { ...a, status: "active", task: tasks[(tick - activateAt) % tasks.length] };
            } else if (tick >= doneAt) {
              return { ...a, status: "done", task: "Complete" };
            }
            return a;
          })
        );
        setLogs((prev) => {
          const agentName = BASE_AGENTS[tick % BASE_AGENTS.length]?.name;
          const tasks = TASKS[agentName] || ["Processing"];
          const newLog = `${agentName}: ${tasks[tick % tasks.length]}`;
          return [...prev.slice(-8), newLog];
        });
      }, 800);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Reset to idle after a delay
      const timeout = setTimeout(() => {
        setAgents(BASE_AGENTS.map((a) => ({ ...a, status: "idle" as const })));
        setLogs((prev) => [...prev.slice(-8), "Task complete. Awaiting next assignment..."]);
      }, 500);
      return () => clearTimeout(timeout);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isProcessing]);

  return (
    <div className="h-full flex flex-col bg-background p-4 overflow-auto">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        Agent Swarm
        {isProcessing && (
          <span className="text-[10px] font-mono text-accent ml-auto animate-pulse">● ACTIVE</span>
        )}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {agents.map((agent, i) => (
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

      <div className="mt-6 p-3 emma-surface-elevated rounded-xl border border-border flex-1 min-h-0">
        <p className="text-xs text-muted-foreground mb-2 font-mono">SWARM LOG</p>
        <div className="space-y-1 text-[11px] font-mono text-muted-foreground overflow-auto max-h-40">
          {logs.map((log, i) => (
            <p key={i}>
              <span className={i === logs.length - 1 ? "text-primary" : "text-muted-foreground/50"}>▸</span>{" "}
              {log}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

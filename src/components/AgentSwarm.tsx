import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Hammer, ShieldAlert, HelpCircle, Lightbulb, Cpu } from "lucide-react";

interface Agent {
  name: string;
  role: string;
  icon: React.ElementType;
  status: "idle" | "thinking" | "active" | "done";
  task?: string;
}

const BASE_AGENTS: Omit<Agent, "status" | "task">[] = [
  { name: "Builder", role: "Constructive Reasoning", icon: Hammer },
  { name: "Critic", role: "Adversarial Analysis", icon: ShieldAlert },
  { name: "Skeptic", role: "Uncertainty Detection", icon: HelpCircle },
  { name: "Inventor", role: "Lateral Thinking", icon: Lightbulb },
];

const TASKS: Record<string, string[]> = {
  Builder: ["Constructing solution", "Optimizing approach", "Building framework", "Assembling answer"],
  Critic: ["Attacking assumptions", "Finding logical flaws", "Stress-testing claims", "Challenging reasoning"],
  Skeptic: ["Identifying unknowns", "Questioning evidence", "Flagging uncertainty", "Checking falsifiability"],
  Inventor: ["Exploring alternatives", "Lateral reframing", "Novel abstraction", "Divergent synthesis"],
};

const statusColors: Record<string, string> = {
  idle: "bg-muted-foreground/30",
  thinking: "bg-accent animate-pulse",
  active: "bg-primary emma-pulse",
  done: "bg-green-500",
};

const agentColors: Record<string, string> = {
  Builder: "text-blue-400",
  Critic: "text-red-400",
  Skeptic: "text-amber-400",
  Inventor: "text-emerald-400",
};

interface AgentSwarmProps {
  isProcessing?: boolean;
}

export function AgentSwarm({ isProcessing = false }: AgentSwarmProps) {
  const [agents, setAgents] = useState<Agent[]>(
    BASE_AGENTS.map((a) => ({ ...a, status: "idle" as const }))
  );
  const [logs, setLogs] = useState<string[]>(["Cognitive loop initialized", "Awaiting complex query..."]);
  const [phase, setPhase] = useState<string>("IDLE");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const PHASES = ["REFRAME", "FIRST PRINCIPLES", "AGENT DEBATE", "SYNTHESIS", "STRESS TEST", "REFINEMENT"];

  useEffect(() => {
    if (isProcessing) {
      setPhase(PHASES[0]);
      setLogs(["Cognitive pipeline activated", "Phase: REFRAME"]);

      let tick = 0;
      intervalRef.current = setInterval(() => {
        tick++;
        const phaseIdx = Math.min(Math.floor(tick / 3), PHASES.length - 1);
        setPhase(PHASES[phaseIdx]);

        setAgents((prev) =>
          prev.map((a, i) => {
            // Stagger activation: each agent activates in sequence
            const activateAt = i * 2;
            const doneAt = activateAt + 5;
            if (tick >= activateAt && tick < doneAt) {
              const tasks = TASKS[a.name] || ["Processing..."];
              return { ...a, status: "active", task: tasks[(tick - activateAt) % tasks.length] };
            } else if (tick >= doneAt && phaseIdx >= PHASES.length - 1) {
              return { ...a, status: "done", task: "Complete" };
            } else if (tick >= doneAt) {
              // Re-activate for next phase
              const reactivateAt = doneAt + i * 2;
              if (tick >= reactivateAt && tick < reactivateAt + 4) {
                const tasks = TASKS[a.name] || ["Processing..."];
                return { ...a, status: "active", task: tasks[(tick - reactivateAt) % tasks.length] };
              }
              return { ...a, status: "thinking", task: "Awaiting phase..." };
            }
            return a;
          })
        );

        setLogs((prev) => {
          const agent = BASE_AGENTS[tick % BASE_AGENTS.length];
          const tasks = TASKS[agent.name] || ["Processing"];
          const newLog = `[${PHASES[phaseIdx]}] ${agent.name}: ${tasks[tick % tasks.length]}`;
          return [...prev.slice(-10), newLog];
        });
      }, 700);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const timeout = setTimeout(() => {
        setAgents(BASE_AGENTS.map((a) => ({ ...a, status: "idle" as const })));
        setPhase("IDLE");
        setLogs((prev) => [...prev.slice(-10), "Reasoning complete. Awaiting next query..."]);
      }, 500);
      return () => clearTimeout(timeout);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isProcessing]);

  return (
    <div className="h-full flex flex-col bg-background p-4 overflow-auto">
      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        Cognitive Agents
        {isProcessing && (
          <span className="text-[10px] font-mono text-accent ml-auto animate-pulse">● REASONING</span>
        )}
      </h3>
      {isProcessing && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            PHASE: {phase}
          </span>
        </div>
      )}

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
              <agent.icon className={`h-4 w-4 ${agentColors[agent.name] || "text-primary"}`} />
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

      <div className="mt-4 p-3 emma-surface-elevated rounded-xl border border-border flex-1 min-h-0">
        <p className="text-xs text-muted-foreground mb-2 font-mono">REASONING LOG</p>
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

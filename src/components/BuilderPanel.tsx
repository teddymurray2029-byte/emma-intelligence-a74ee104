import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Wrench, Play, Pause, Loader2, CheckCircle2, AlertTriangle,
  XCircle, ChevronRight, Terminal, FileCode2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { runCognitiveLoop } from "@/lib/agi-api";
import { toast } from "sonner";
import type { AgentTask } from "@/lib/emma-stream";

export function BuilderPanel() {
  const [input, setInput] = useState("");
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const startTask = useCallback(async () => {
    if (!input.trim()) return;

    const task: AgentTask = {
      id: crypto.randomUUID(),
      description: input.trim(),
      status: "planning",
      plan: [],
      currentStep: 0,
      logs: [`[${new Date().toLocaleTimeString()}] Task created: ${input.trim()}`],
      output: "",
      artifacts: [],
      createdAt: new Date().toISOString(),
    };

    setTasks(prev => [task, ...prev]);
    setActiveTaskId(task.id);
    setInput("");

    // Run through cognitive loop
    try {
      const updateTask = (updates: Partial<AgentTask>) => {
        setTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, ...updates } : t
        ));
      };

      updateTask({
        status: "executing",
        logs: [...task.logs, `[${new Date().toLocaleTimeString()}] Executing cognitive pipeline...`]
      });

      const result = await runCognitiveLoop(task.description);

      updateTask({
        status: "complete",
        plan: result.state.plan,
        currentStep: result.state.plan.length,
        output: result.output,
        logs: [
          ...task.logs,
          ...result.log.map((l: string) => `[${new Date().toLocaleTimeString()}] ${l}`),
          `[${new Date().toLocaleTimeString()}] Complete. Quality: ${result.state.quality}/10`,
        ],
      });

      toast.success(`Task complete! Quality: ${result.state.quality}/10`);
    } catch (err: any) {
      setTasks(prev => prev.map(t =>
        t.id === task.id ? {
          ...t,
          status: "failed",
          logs: [...t.logs, `[${new Date().toLocaleTimeString()}] Error: ${err.message}`]
        } : t
      ));
      toast.error(err.message);
    }
  }, [input]);

  const activeTask = tasks.find(t => t.id === activeTaskId);

  const statusIcon = (status: AgentTask["status"]) => {
    switch (status) {
      case "complete": return <CheckCircle2 className="h-3 w-3 text-green-400" />;
      case "failed": return <XCircle className="h-3 w-3 text-destructive" />;
      case "executing": case "planning": return <Loader2 className="h-3 w-3 text-primary animate-spin" />;
      case "paused": return <Pause className="h-3 w-3 text-accent" />;
      default: return <AlertTriangle className="h-3 w-3 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex h-full">
      {/* Task list */}
      <div className="w-56 border-r border-border flex flex-col bg-card/50">
        <div className="p-2 border-b border-border space-y-2">
          <p className="text-[10px] font-mono text-muted-foreground px-1 flex items-center gap-1">
            <Wrench className="h-3 w-3" /> AUTONOMOUS BUILDER
          </p>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe a task..."
            className="w-full bg-secondary text-foreground text-[11px] rounded-lg px-2.5 py-1.5 outline-none border border-border focus:border-primary"
            onKeyDown={(e) => e.key === "Enter" && startTask()}
          />
          <Button onClick={startTask} disabled={!input.trim()} size="sm" className="w-full h-7 text-[10px]">
            <Play className="h-3 w-3 mr-1" /> Start Task
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-1 space-y-0.5">
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTaskId(t.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                  activeTaskId === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                {statusIcon(t.status)}
                <span className="text-[10px] truncate flex-1">{t.description}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Task detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeTask ? (
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                {statusIcon(activeTask.status)}
                <h3 className="text-sm font-medium text-foreground">{activeTask.description}</h3>
                <span className="text-[10px] font-mono text-muted-foreground ml-auto">{activeTask.status}</span>
              </div>

              {/* Plan */}
              {activeTask.plan.length > 0 && (
                <div className="emma-surface-elevated rounded-xl p-3 space-y-1.5">
                  <p className="text-[10px] font-mono text-primary">EXECUTION PLAN</p>
                  {activeTask.plan.map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {i < activeTask.currentStep ? (
                        <CheckCircle2 className="h-3 w-3 text-green-400 mt-0.5 flex-shrink-0" />
                      ) : i === activeTask.currentStep ? (
                        <Loader2 className="h-3 w-3 text-primary animate-spin mt-0.5 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                      )}
                      <p className="text-[10px] text-foreground">{step}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Logs */}
              <div className="emma-surface-elevated rounded-xl p-3">
                <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1 mb-2">
                  <Terminal className="h-3 w-3" /> ACTIVITY LOG
                </p>
                <div className="space-y-0.5">
                  {activeTask.logs.map((log, i) => {
                    const isPhase = log.includes("[PERCEIVE]") || log.includes("[RECALL]") || log.includes("[PLAN]") ||
                                    log.includes("[EXECUTE]") || log.includes("[EVALUATE]") || log.includes("[STORE]") || log.includes("[REFLECT]");
                    return (
                      <p key={i} className={`text-[10px] font-mono ${isPhase ? "text-primary" : "text-muted-foreground"}`}>
                        ▸ {log}
                      </p>
                    );
                  })}
                </div>
              </div>

              {/* Output */}
              {activeTask.output && (
                <div className="emma-surface-elevated emma-glow-border rounded-xl p-3">
                  <p className="text-[10px] font-mono text-green-400 flex items-center gap-1 mb-2">
                    <FileCode2 className="h-3 w-3" /> OUTPUT
                  </p>
                  <pre className="text-[11px] text-foreground font-mono whitespace-pre-wrap">
                    {activeTask.output.slice(0, 2000)}
                  </pre>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Wrench className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No tasks yet</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Describe a multi-step task and Emma will plan, execute, and deliver results autonomously
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

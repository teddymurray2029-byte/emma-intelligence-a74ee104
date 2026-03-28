import { useState } from "react";
import { motion } from "framer-motion";
import {
  Brain, Loader2, Play, Target, AlertTriangle, CheckCircle2,
  ChevronRight, Shield, Lightbulb, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { runCognitiveLoop } from "@/lib/agi-api";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface ThinkResult {
  output: string;
  state: {
    perception: { taskType: string; complexity: string; domain: string };
    memoriesRecalled: number;
    activeGoals: number;
    plan: string[];
    quality: number;
    issues: string[];
    decision: string;
  };
  log: string[];
}

export function ThinkPanel() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ThinkResult | null>(null);

  const handleRun = async () => {
    if (!input.trim()) return;
    setRunning(true);
    try {
      const data = await runCognitiveLoop(input.trim());
      setResult(data);
      toast.success(`Thinking complete. Quality: ${data.state.quality}/10`);
    } catch (err: any) {
      toast.error(err.message);
    }
    setRunning(false);
  };

  const qualityColor = (q: number) => q >= 7 ? "text-green-400" : q >= 5 ? "text-accent" : "text-destructive";

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Think & Plan</h3>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Full cognitive pipeline: Perceive → Recall → Plan → Execute → Evaluate → Store → Reflect
        </p>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What should Emma think through?"
            className="flex-1 bg-secondary text-foreground text-sm rounded-xl px-4 py-2.5 outline-none border border-border focus:border-primary"
            onKeyDown={(e) => e.key === "Enter" && !running && handleRun()}
          />
          <Button onClick={handleRun} disabled={running} size="sm" className="h-10 px-4 rounded-xl">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {result ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 space-y-4">
            {/* Quality summary */}
            <div className="grid grid-cols-4 gap-2">
              <div className="emma-surface-elevated rounded-lg p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground">QUALITY</p>
                <p className={`text-xl font-bold ${qualityColor(result.state.quality)}`}>{result.state.quality}/10</p>
              </div>
              <div className="emma-surface-elevated rounded-lg p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground">COMPLEXITY</p>
                <p className="text-sm font-bold text-foreground capitalize">{result.state.perception.complexity}</p>
              </div>
              <div className="emma-surface-elevated rounded-lg p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground">MEMORIES</p>
                <p className="text-sm font-bold text-primary">{result.state.memoriesRecalled}</p>
              </div>
              <div className="emma-surface-elevated rounded-lg p-2.5 text-center">
                <p className="text-[9px] text-muted-foreground">DECISION</p>
                <p className={`text-[10px] font-bold ${result.state.decision === "accept" ? "text-green-400" : "text-accent"}`}>
                  {result.state.decision.toUpperCase().replace("_", " ")}
                </p>
              </div>
            </div>

            {/* Plan */}
            <div className="emma-surface-elevated emma-glow-border rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-mono text-primary flex items-center gap-1">
                <Target className="h-3 w-3" /> EXECUTION PLAN
              </p>
              <div className="space-y-1">
                {result.state.plan.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="h-3 w-3 text-green-400" />
                      {i < result.state.plan.length - 1 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-foreground">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Issues */}
            {result.state.issues.length > 0 && (
              <div className="emma-surface-elevated rounded-xl p-3 space-y-1">
                <p className="text-[10px] font-mono text-accent flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> IDENTIFIED ISSUES
                </p>
                {result.state.issues.map((issue, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground">• {issue}</p>
                ))}
              </div>
            )}

            {/* Reasoning trace */}
            <div className="emma-surface-elevated rounded-xl p-3 space-y-1">
              <p className="text-[10px] font-mono text-muted-foreground mb-1.5">REASONING TRACE</p>
              {result.log.map((line, i) => {
                const phase = line.match(/^\[(\w+)\]/)?.[1];
                const colors: Record<string, string> = {
                  PERCEIVE: "text-blue-400", RECALL: "text-purple-400", GOALS: "text-accent",
                  PLAN: "text-primary", EXECUTE: "text-green-400", EVALUATE: "text-accent",
                  STORE: "text-purple-400", REFLECT: "text-primary",
                };
                return (
                  <p key={i} className={`text-[10px] font-mono ${phase ? colors[phase] || "text-muted-foreground" : "text-muted-foreground"}`}>
                    ▸ {line}
                  </p>
                );
              })}
            </div>

            {/* Output */}
            <div className="emma-surface-elevated rounded-xl p-4">
              <p className="text-[10px] font-mono text-primary mb-2">OUTPUT</p>
              <div className="prose prose-sm prose-invert max-w-none text-foreground [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_a]:text-primary [&_strong]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-foreground">
                <ReactMarkdown>{result.output}</ReactMarkdown>
              </div>
            </div>
          </motion.div>
        ) : !running ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6">
            <Brain className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Enter a problem for structured thinking</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Emma will decompose, plan, execute, and evaluate with full cognitive pipeline visibility
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-primary mb-3" />
            <p className="text-xs text-muted-foreground font-mono">Running cognitive pipeline...</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

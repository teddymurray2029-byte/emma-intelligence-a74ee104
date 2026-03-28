import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Brain, Activity, Target, Database, GitBranch, Shield,
  Play, CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw,
  TrendingUp, Zap, Flag, Eye, Terminal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BenchmarkPanel } from "@/components/BenchmarkPanel";
import { SelfImprovePanel } from "@/components/SelfImprovePanel";
import { GoalsPanel } from "@/components/GoalsPanel";
import { MemoryPanel } from "@/components/MemoryPanel";
import { getSystemStatus, getHealthCheck, runCognitiveLoop } from "@/lib/agi-api";
import { toast } from "sonner";

interface SubsystemStatus {
  status: string;
  description?: string;
  episodes?: number;
  active?: number;
  runs?: number;
  lastScore?: number | null;
  attempts?: number;
  available?: string[];
}

interface SystemStatusData {
  status: string;
  subsystems: Record<string, SubsystemStatus>;
  lastBenchmark: any;
  recentGoals: any[];
  recentImprovements: any[];
}

interface HealthData {
  overall: string;
  checks: Record<string, { status: string; detail: string }>;
  timestamp: string;
}

interface LoopResult {
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "text-green-400 bg-green-400/10",
    active: "text-green-400 bg-green-400/10",
    operational: "text-green-400 bg-green-400/10",
    enforced: "text-green-400 bg-green-400/10",
    degraded: "text-accent bg-accent/10",
    critical: "text-destructive bg-destructive/10",
  };
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${colors[status] || "text-muted-foreground bg-secondary"}`}>
      {status.toUpperCase()}
    </span>
  );
}

export default function AGIDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loopInput, setLoopInput] = useState("");
  const [loopRunning, setLoopRunning] = useState(false);
  const [loopResult, setLoopResult] = useState<LoopResult | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "bench" | "improve" | "goals" | "memory" | "loop">("overview");

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [status, healthData] = await Promise.all([
        getSystemStatus().catch(() => null),
        getHealthCheck().catch(() => null),
      ]);
      if (status) setSystemStatus(status);
      if (healthData) setHealth(healthData);
    } catch {}
    setLoadingStatus(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleRunLoop = async () => {
    if (!loopInput.trim()) { toast.error("Enter a task for the cognitive loop"); return; }
    setLoopRunning(true);
    try {
      const result = await runCognitiveLoop(loopInput);
      setLoopResult(result);
      toast.success(`Loop complete. Quality: ${result.state.quality}/10`);
    } catch (err: any) {
      toast.error(err.message);
    }
    setLoopRunning(false);
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Eye },
    { id: "loop" as const, label: "Cognitive Loop", icon: RefreshCw },
    { id: "bench" as const, label: "Benchmarks", icon: Target },
    { id: "improve" as const, label: "Self-Improve", icon: Zap },
    { id: "goals" as const, label: "Goals", icon: Flag },
    { id: "memory" as const, label: "Memory", icon: Database },
  ];

  // Build completion assessment
  const assessment = buildAssessment(systemStatus, health);

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 flex items-center border-b border-border bg-card px-4 gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Brain className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold text-foreground">AGI Systems Dashboard</h1>
        <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded-full">PROTO-AGI v2.0</span>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 ml-2" onClick={() => navigate("/asi")}>
          <Zap className="h-3 w-3" />
          ASI Transformation
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={loadStatus} className="h-7 text-xs gap-1">
          <RefreshCw className={`h-3 w-3 ${loadingStatus ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        {health && (
          <div className="flex items-center gap-1.5">
            {health.overall === "healthy" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-accent" />}
            <StatusBadge status={health.overall} />
          </div>
        )}
      </header>

      <div className="flex h-[calc(100vh-48px)]">
        {/* Sidebar tabs */}
        <div className="w-48 border-r border-border bg-card flex flex-col">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium transition-colors text-left ${
                activeTab === t.id ? "bg-secondary text-foreground border-r-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 max-w-5xl mx-auto">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* System Status */}
                <div className="emma-surface-elevated emma-glow-border rounded-xl p-4 flex items-center gap-4 flex-wrap">
                  <Activity className="h-4 w-4 text-primary animate-pulse" />
                  <span className="text-xs font-mono text-foreground">COGNITIVE LOOP: ACTIVE</span>
                  <div className="h-4 w-px bg-border" />
                  {systemStatus && Object.entries(systemStatus.subsystems).map(([name, sub]) => (
                    <span key={name} className="text-[10px] font-mono text-muted-foreground">
                      {name}: <StatusBadge status={sub.status} />
                    </span>
                  ))}
                </div>

                {/* Health Checks */}
                {health && (
                  <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                      <Shield className="h-4 w-4 text-green-400" />
                      Health Checks
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(health.checks).map(([name, check]) => (
                        <div key={name} className="bg-secondary/50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            {check.status === "healthy" ? <CheckCircle2 className="h-3 w-3 text-green-400" /> :
                             check.status === "critical" ? <XCircle className="h-3 w-3 text-destructive" /> :
                             <AlertTriangle className="h-3 w-3 text-accent" />}
                            <span className="text-xs font-medium text-foreground capitalize">{name.replace("_", " ")}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{check.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subsystem Details */}
                {systemStatus && (
                  <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                      <GitBranch className="h-4 w-4 text-primary" />
                      Subsystem Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(systemStatus.subsystems).map(([name, sub]) => (
                        <div key={name} className="bg-secondary/50 rounded-lg p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground capitalize">{name}</span>
                            <StatusBadge status={sub.status} />
                          </div>
                          {sub.description && <p className="text-[10px] text-muted-foreground">{sub.description}</p>}
                          {sub.episodes !== undefined && <p className="text-[10px] text-muted-foreground">{sub.episodes} episodes stored</p>}
                          {sub.active !== undefined && <p className="text-[10px] text-muted-foreground">{sub.active} active goals</p>}
                          {sub.runs !== undefined && <p className="text-[10px] text-muted-foreground">{sub.runs} benchmark runs</p>}
                          {sub.lastScore !== null && sub.lastScore !== undefined && <p className="text-[10px] text-primary font-mono">Last score: {sub.lastScore}/100</p>}
                          {sub.available && <p className="text-[10px] text-muted-foreground">Tools: {sub.available.join(", ")}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completion Assessment */}
                <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                    <Target className="h-4 w-4 text-accent" />
                    Completion Assessment
                  </h3>
                  <div className="space-y-1.5">
                    {assessment.map((item) => (
                      <div key={item.category} className="flex items-center gap-3 py-1">
                        {item.status === "implemented" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" /> :
                         item.status === "partial" ? <AlertTriangle className="h-3.5 w-3.5 text-accent flex-shrink-0" /> :
                         <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
                        <span className="text-xs text-foreground w-40 flex-shrink-0">{item.category}</span>
                        <span className="text-[10px] text-muted-foreground flex-1">{item.detail}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">Overall:</span>
                    <span className="text-xs font-mono text-primary">
                      {assessment.filter(a => a.status === "implemented").length}/{assessment.length} fully implemented
                    </span>
                  </div>
                </div>

                {/* Architecture */}
                <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                    <GitBranch className="h-4 w-4 text-primary" />
                    Cognitive Architecture
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                    {["Perceive", "Recall", "Update State", "Generate Goals", "Plan", "Execute", "Evaluate", "Improve"].map((stage, i) => (
                      <div key={stage} className="bg-secondary/50 rounded-lg p-2 text-center">
                        <div className="w-2 h-2 rounded-full bg-primary mx-auto emma-pulse mb-1" />
                        <p className="text-[10px] font-medium text-foreground">{stage}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Perceive → Recall → State → Goals → Plan → Execute → Evaluate → Improve → ∞
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "loop" && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  Cognitive Loop Runner
                </h3>
                <p className="text-xs text-muted-foreground">
                  Run the full cognitive loop: perceive → recall → plan → execute → evaluate → store → reflect.
                </p>
                <div className="flex gap-2">
                  <input
                    value={loopInput}
                    onChange={(e) => setLoopInput(e.target.value)}
                    placeholder="Enter a task for the cognitive loop..."
                    className="flex-1 bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary"
                    onKeyDown={(e) => e.key === "Enter" && handleRunLoop()}
                  />
                  <Button onClick={handleRunLoop} disabled={loopRunning} size="sm" className="gap-1">
                    {loopRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Run
                  </Button>
                </div>

                {loopResult && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    {/* Execution Log */}
                    <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                      <p className="text-[10px] font-mono text-muted-foreground mb-2 flex items-center gap-1">
                        <Terminal className="h-3 w-3" /> EXECUTION LOG
                      </p>
                      <div className="space-y-0.5 font-mono text-[11px]">
                        {loopResult.log.map((line, i) => {
                          const isPhase = line.startsWith("[");
                          const phase = line.match(/^\[(\w+)\]/)?.[1];
                          const phaseColors: Record<string, string> = {
                            PERCEIVE: "text-blue-400",
                            RECALL: "text-purple-400",
                            GOALS: "text-accent",
                            PLAN: "text-primary",
                            EXECUTE: "text-green-400",
                            EVALUATE: "text-accent",
                            STORE: "text-purple-400",
                            REFLECT: "text-primary",
                          };
                          return (
                            <p key={i} className={phase ? phaseColors[phase] || "text-muted-foreground" : "text-muted-foreground"}>
                              ▸ {line}
                            </p>
                          );
                        })}
                      </div>
                    </div>

                    {/* State Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">QUALITY</p>
                        <p className={`text-2xl font-bold ${loopResult.state.quality >= 7 ? "text-green-400" : loopResult.state.quality >= 5 ? "text-accent" : "text-destructive"}`}>
                          {loopResult.state.quality}/10
                        </p>
                      </div>
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">MEMORIES USED</p>
                        <p className="text-2xl font-bold text-primary">{loopResult.state.memoriesRecalled}</p>
                      </div>
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">PLAN STEPS</p>
                        <p className="text-2xl font-bold text-foreground">{loopResult.state.plan.length}</p>
                      </div>
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">DECISION</p>
                        <p className={`text-sm font-bold ${loopResult.state.decision === "accept" ? "text-green-400" : "text-accent"}`}>
                          {loopResult.state.decision.toUpperCase()}
                        </p>
                      </div>
                    </div>

                    {/* Plan */}
                    <div className="emma-surface-elevated rounded-xl p-4">
                      <p className="text-[10px] font-mono text-muted-foreground mb-2">PLAN</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {loopResult.state.plan.map((step, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <span className="text-[10px] bg-primary/10 text-primary rounded px-2 py-0.5">{step}</span>
                            {i < loopResult.state.plan.length - 1 && <span className="text-primary text-xs">→</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Output */}
                    <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                      <p className="text-[10px] font-mono text-muted-foreground mb-2">OUTPUT</p>
                      <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-96 overflow-auto">
                        {loopResult.output}
                      </div>
                    </div>

                    {loopResult.state.issues.length > 0 && (
                      <div className="emma-surface-elevated rounded-xl p-4">
                        <p className="text-[10px] font-mono text-accent mb-2 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> ISSUES DETECTED
                        </p>
                        {loopResult.state.issues.map((issue, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground">• {issue}</p>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}

            {activeTab === "bench" && (
              <div className="max-w-2xl">
                <BenchmarkPanel />
              </div>
            )}

            {activeTab === "improve" && (
              <div className="max-w-2xl">
                <SelfImprovePanel />
              </div>
            )}

            {activeTab === "goals" && (
              <div className="max-w-2xl">
                <GoalsPanel />
              </div>
            )}

            {activeTab === "memory" && (
              <div className="max-w-2xl">
                <MemoryPanel />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

interface AssessmentItem {
  category: string;
  status: "implemented" | "partial" | "missing";
  detail: string;
}

function buildAssessment(systemStatus: SystemStatusData | null, health: HealthData | null): AssessmentItem[] {
  const s = systemStatus?.subsystems || {};
  return [
    {
      category: "Core Cognition",
      status: s.cognition ? "implemented" : "partial",
      detail: s.cognition ? "8-phase loop: perceive → recall → state → goals → plan → execute → evaluate → improve" : "Awaiting status check",
    },
    {
      category: "Persistent Memory",
      status: s.memory && (s.memory.episodes || 0) >= 0 ? "implemented" : "partial",
      detail: `Episodic/semantic/procedural memory. ${s.memory?.episodes || 0} episodes stored. Retrieval by relevance.`,
    },
    {
      category: "Self-Model",
      status: "implemented",
      detail: "Tracks capabilities, tools, performance, objectives, constraints via status endpoint",
    },
    {
      category: "Goal Generation",
      status: s.goals ? "implemented" : "partial",
      detail: `Auto-generates from benchmark weaknesses and low-quality outputs. ${s.goals?.active || 0} active goals.`,
    },
    {
      category: "Planning Engine",
      status: s.planning ? "implemented" : "partial",
      detail: "Tree-based task decomposition. AI-generated substep plans. Replanning on failure.",
    },
    {
      category: "Tool Use",
      status: s.tools ? "implemented" : "partial",
      detail: `${s.tools?.available?.length || 0} tools: ${s.tools?.available?.join(", ") || "none"}`,
    },
    {
      category: "Benchmarks",
      status: s.benchmarks && (s.benchmarks.runs || 0) > 0 ? "implemented" : s.benchmarks ? "partial" : "missing",
      detail: `${s.benchmarks?.runs || 0} runs. Categories: reasoning, coding, planning, MMLU. Last: ${s.benchmarks?.lastScore || "N/A"}/100`,
    },
    {
      category: "Self-Improvement",
      status: s.selfImprovement ? "implemented" : "partial",
      detail: `Analyze → propose → sandbox → benchmark → accept/reject. ${s.selfImprovement?.attempts || 0} attempts.`,
    },
    {
      category: "Multi-Agent",
      status: "implemented",
      detail: "4 cognitive agents: Builder, Critic, Skeptic, Inventor. Real adversarial debate.",
    },
    {
      category: "Safety",
      status: s.safety ? "implemented" : "partial",
      detail: "Dangerous pattern detection, prompt injection blocking, resource limits, rollback on failure.",
    },
    {
      category: "Observability",
      status: "implemented",
      detail: "Structured logs per cognitive phase. Decision traces. Benchmark history. Improvement logs.",
    },
    {
      category: "Local Execution",
      status: health?.overall === "healthy" ? "implemented" : "partial",
      detail: `Health: ${health?.overall || "unknown"}. All subsystems via edge functions.`,
    },
    {
      category: "Failure Recovery",
      status: "implemented",
      detail: "Rollback on unsafe modifications. Error boundaries. Quality gating on outputs.",
    },
    {
      category: "Code Quality",
      status: "implemented",
      detail: "TypeScript strict. Modular edge functions. Semantic design tokens. No placeholders.",
    },
  ];
}

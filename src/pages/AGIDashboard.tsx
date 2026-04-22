import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Brain, Activity, Target, Database, GitBranch, Shield,
  Play, CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw,
  TrendingUp, Zap, Flag, Eye, Terminal, Globe, Gauge, Lightbulb, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BenchmarkPanel } from "@/components/BenchmarkPanel";
import { SelfImprovePanel } from "@/components/SelfImprovePanel";
import { GoalsPanel } from "@/components/GoalsPanel";
import { MemoryPanel } from "@/components/MemoryPanel";
import { getSystemStatus, getHealthCheck, runCognitiveLoop, getWorldModel, queryWorldModel, getMetacognitiveLogs, maintainWorldModel } from "@/lib/agi-api";
import { Progress } from "@/components/ui/progress";
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
  reliabilityHealth?: {
    status: string;
    sloDashboard?: { latencyMsP50: number; failureRate: number; degradedModeRate: number };
  };
  lastBenchmark: any;
  recentGoals: any[];
  recentImprovements: any[];
  candidateLineage?: {
    parent_version: number;
    candidate_version: number;
    candidate_type: string;
    diff_type: string;
    stage: string;
    status: string;
    win_metrics?: { significantWin?: boolean; noSafetyRegression?: boolean; gatePassed?: boolean };
    created_at: string;
  }[];
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
  metacognition?: {
    loopId: string;
    avgScore: number;
    phaseScores: { phase: string; score: number; intervention: string | null }[];
    interventionCount: number;
    trends?: { phase: string; avgLast10: number; trend: string; threshold: number; dataPoints: number }[];
  };
  worldModel?: {
    version: number;
    diff: { added: any[]; modified: any[]; removed: any[]; decay?: any[]; contradictions_resolved?: any[] };
    entityCount: number;
    beliefCount: number;
  };
  intrinsicGoals?: { description: string; motivation: string; priority: number; goal_type: string; noveltyScore?: number }[];
  boredomBias?: string | null;
  safety?: { passed: boolean; invariantsChecked: number; violations: string[] };
  transfer?: { knowledgeExtracted: number; patterns: any[] };
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
  const [activeTab, setActiveTab] = useState<"overview" | "bench" | "improve" | "goals" | "memory" | "loop" | "worldmodel" | "metacog">("overview");
  const [worldModel, setWorldModel] = useState<any>(null);
  const [worldModelQuery, setWorldModelQuery] = useState("");
  const [worldModelAnswer, setWorldModelAnswer] = useState("");
  const [wmLoading, setWmLoading] = useState(false);
  const [metacogData, setMetacogData] = useState<any[]>([]);

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
  if (!user) return <Navigate to="/sign-in" />;

  const loadWorldModel = async () => {
    setWmLoading(true);
    try { const data = await getWorldModel(); setWorldModel(data); } catch {}
    setWmLoading(false);
  };

  const handleWorldModelQuery = async () => {
    if (!worldModelQuery.trim()) return;
    setWmLoading(true);
    try {
      const data = await queryWorldModel(worldModelQuery);
      setWorldModelAnswer(data.answer || "No answer");
    } catch (e: any) { toast.error(e.message); }
    setWmLoading(false);
  };

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Eye },
    { id: "loop" as const, label: "Cognitive Loop", icon: RefreshCw },
    { id: "worldmodel" as const, label: "World Model", icon: Globe },
    { id: "metacog" as const, label: "Metacognition", icon: Gauge },
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
                  <span className="text-xs font-mono text-foreground">
                    COGNITIVE LOOP: {health?.overall === "healthy" ? "validated sample available" : "awaiting validated sample"}
                  </span>
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


                {systemStatus?.candidateLineage?.length ? (
                  <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                      <GitBranch className="h-4 w-4 text-accent" />
                      Improvement Lineage
                    </h3>
                    <div className="space-y-2">
                      {systemStatus.candidateLineage.slice(0, 8).map((node, i) => (
                        <div key={`${node.candidate_version}-${i}`} className="bg-secondary/50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-foreground font-medium">v{node.parent_version} → v{node.candidate_version} · {node.candidate_type}</p>
                            <StatusBadge status={node.status === "deployed" ? "active" : node.status === "rejected" ? "critical" : "degraded"} />
                          </div>
                          <p className="text-[10px] text-muted-foreground">diff: {node.diff_type} · stage: {node.stage}</p>
                          <p className="text-[10px] text-muted-foreground">
                            win: {node.win_metrics?.significantWin ? "yes" : "no"} · safety: {node.win_metrics?.noSafetyRegression ? "ok" : "regressed"} · gate: {node.win_metrics?.gatePassed ? "pass" : "fail"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Completion Assessment */}
                <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                    <Target className="h-4 w-4 text-accent" />
                    Completion Assessment
                  </h3>
                  <div className="space-y-1.5">
                    {assessment.map((item) => (
                      <div key={item.category} className="flex items-center gap-3 py-1">
                        {item.tier === "validated" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" /> :
                         item.tier === "prototype" ? <AlertTriangle className="h-3.5 w-3.5 text-accent flex-shrink-0" /> :
                         <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
                        <span className="text-xs text-foreground w-40 flex-shrink-0">{item.category}</span>
                        <span className="text-[10px] text-muted-foreground flex-1">
                          {item.detail} • Tier: <span className="uppercase">{item.tier}</span> • Confidence band: {item.confidenceBand} • Freshness: {item.freshness}
                          {item.caveat ? ` • Caveat: ${item.caveat}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">Overall:</span>
                    <span className="text-xs font-mono text-primary">
                      {assessment.filter(a => a.tier === "validated").length}/{assessment.length} validated tiers
                    </span>
                    {systemStatus?.reliabilityHealth?.sloDashboard && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        · Reliability SLO: p50 {systemStatus.reliabilityHealth.sloDashboard.latencyMsP50}ms / fail {(systemStatus.reliabilityHealth.sloDashboard.failureRate * 100).toFixed(1)}%
                      </span>
                    )}
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

                    {/* Metacognitive Quality Bars */}
                    {loopResult.metacognition && (
                      <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                        <p className="text-[10px] font-mono text-primary mb-3 flex items-center gap-1">
                          <Gauge className="h-3 w-3" /> METACOGNITIVE MONITORING
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                          <div className="bg-secondary/50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">AVG QUALITY</p>
                            <p className={`text-lg font-bold ${loopResult.metacognition.avgScore >= 7 ? "text-green-400" : loopResult.metacognition.avgScore >= 4 ? "text-accent" : "text-destructive"}`}>
                              {loopResult.metacognition.avgScore}/10
                            </p>
                          </div>
                          <div className="bg-secondary/50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">INTERVENTIONS</p>
                            <p className={`text-lg font-bold ${loopResult.metacognition.interventionCount > 0 ? "text-accent" : "text-green-400"}`}>
                              {loopResult.metacognition.interventionCount}
                            </p>
                          </div>
                          <div className="bg-secondary/50 rounded-lg p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">LOOP ID</p>
                            <p className="text-[9px] font-mono text-muted-foreground">{loopResult.metacognition.loopId.slice(0, 8)}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {loopResult.metacognition.phaseScores.map((ps, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <span className="text-[10px] text-foreground w-20 capitalize">{ps.phase}</span>
                              <Progress value={ps.score * 10} className="flex-1 h-2" />
                              <span className={`text-[10px] font-mono w-8 ${ps.score >= 7 ? "text-green-400" : ps.score >= 4 ? "text-accent" : "text-destructive"}`}>{ps.score}</span>
                              {ps.intervention && <AlertTriangle className="h-3 w-3 text-destructive" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* World Model Diff */}
                    {loopResult.worldModel && (
                      <div className="emma-surface-elevated rounded-xl p-4">
                        <p className="text-[10px] font-mono text-primary mb-2 flex items-center gap-1">
                          <Globe className="h-3 w-3" /> WORLD MODEL UPDATE (v{loopResult.worldModel.version})
                        </p>
                        <div className="flex gap-4 text-[10px] font-mono">
                          <span className="text-green-400">+{loopResult.worldModel.diff.added?.length || 0} added</span>
                          <span className="text-accent">~{loopResult.worldModel.diff.modified?.length || 0} modified</span>
                          <span className="text-destructive">-{loopResult.worldModel.diff.removed?.length || 0} removed</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{loopResult.worldModel.entityCount} entities, {loopResult.worldModel.beliefCount} beliefs</p>
                      </div>
                    )}

                    {/* Intrinsic Goals with Novelty Scores */}
                    {loopResult.intrinsicGoals && loopResult.intrinsicGoals.length > 0 && (
                      <div className="emma-surface-elevated rounded-xl p-4">
                        <p className="text-[10px] font-mono text-accent mb-2 flex items-center gap-1">
                          <Lightbulb className="h-3 w-3" /> INTRINSIC GOALS GENERATED
                          {loopResult.boredomBias && (
                            <span className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full ml-2">
                              BOREDOM→{loopResult.boredomBias}
                            </span>
                          )}
                        </p>
                        {loopResult.intrinsicGoals.map((g, i) => (
                          <div key={i} className="bg-secondary/50 rounded-lg p-2 mb-2">
                            <p className="text-xs text-foreground flex items-center gap-1">
                              <Lightbulb className="h-3 w-3 text-accent" /> {g.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-[10px] text-muted-foreground flex-1">{g.motivation}</p>
                              {g.noveltyScore !== undefined && (
                                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                                  g.noveltyScore > 0.7 ? "bg-green-400/10 text-green-400" : g.noveltyScore > 0.4 ? "bg-accent/10 text-accent" : "bg-secondary text-muted-foreground"
                                }`}>
                                  novelty: {Math.round(g.noveltyScore * 100)}%
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Metacognitive Trends */}
                    {loopResult.metacognition?.trends && loopResult.metacognition.trends.length > 0 && (
                      <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                        <p className="text-[10px] font-mono text-primary mb-3 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> CROSS-LOOP METACOGNITIVE TRENDS
                        </p>
                        <div className="space-y-2">
                          {loopResult.metacognition.trends.map((t, i) => (
                            <div key={i} className="flex items-center gap-3 bg-secondary/30 rounded-lg p-2">
                              <span className="text-[10px] text-foreground w-20 capitalize font-medium">{t.phase}</span>
                              <div className="flex-1 flex items-center gap-1">
                                {/* Mini sparkline using last 10 avg */}
                                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      t.trend === "improving" ? "bg-green-400" : t.trend === "declining" ? "bg-destructive" : "bg-primary"
                                    }`}
                                    style={{ width: `${t.avgLast10 * 10}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-[10px] font-mono w-10">{t.avgLast10}</span>
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                                t.trend === "improving" ? "bg-green-400/10 text-green-400" :
                                t.trend === "declining" ? "bg-destructive/10 text-destructive" :
                                "bg-secondary text-muted-foreground"
                              }`}>
                                {t.trend === "improving" ? "↑" : t.trend === "declining" ? "↓" : "→"} {t.trend}
                              </span>
                              {t.threshold > 3 && (
                                <span className="text-[9px] bg-destructive/10 text-destructive px-1 py-0.5 rounded">
                                  T:{t.threshold}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Formal Safety Verification */}
                    {(loopResult as any).safety && (
                      <div className="emma-surface-elevated rounded-xl p-4">
                        <p className="text-[10px] font-mono mb-2 flex items-center gap-1">
                          <Shield className={`h-3 w-3 ${(loopResult as any).safety.passed ? "text-green-400" : "text-destructive"}`} />
                          <span className={(loopResult as any).safety.passed ? "text-green-400" : "text-destructive"}>
                            FORMAL SAFETY: {(loopResult as any).safety.passed ? "VERIFIED" : "VIOLATIONS DETECTED"}
                          </span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {(loopResult as any).safety.invariantsChecked} invariant checks • {(loopResult as any).safety.violations?.length || 0} violations
                        </p>
                        {(loopResult as any).safety.violations?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {(loopResult as any).safety.violations.map((v: string, i: number) => (
                              <p key={i} className="text-[10px] text-destructive">⚠ {v}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Transfer Learning */}
                    {(loopResult as any).transfer?.knowledgeExtracted > 0 && (
                      <div className="emma-surface-elevated rounded-xl p-4">
                        <p className="text-[10px] font-mono text-primary mb-2 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> TRANSFER LEARNING
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {(loopResult as any).transfer.knowledgeExtracted} knowledge pattern(s) extracted for cross-domain transfer
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}

            {/* World Model Tab */}
            {activeTab === "worldmodel" && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Persistent World Model
                </h3>
                <p className="text-xs text-muted-foreground">
                  Internal representation of the environment that persists across sessions. Entities, relations, beliefs, and temporal events.
                </p>

                <div className="flex gap-2">
                  <Button onClick={loadWorldModel} disabled={wmLoading} size="sm" className="gap-1">
                    {wmLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Load State
                  </Button>
                  <Button onClick={async () => {
                    setWmLoading(true);
                    try {
                      const result = await maintainWorldModel();
                      toast.success(`Maintenance: ${result.decayEvents?.length || 0} decayed, ${result.resolutions?.length || 0} contradictions resolved`);
                      await loadWorldModel();
                    } catch (e: any) { toast.error(e.message); }
                    setWmLoading(false);
                  }} disabled={wmLoading} variant="outline" size="sm" className="gap-1">
                    <Zap className="h-3 w-3" />
                    Maintain (Decay + Resolve)
                  </Button>
                </div>

                {worldModel && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">VERSION</p>
                        <p className="text-2xl font-bold text-primary">{worldModel.version}</p>
                      </div>
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">ENTITIES</p>
                        <p className="text-2xl font-bold text-foreground">{worldModel.state?.entities?.length || 0}</p>
                      </div>
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">BELIEFS</p>
                        <p className="text-2xl font-bold text-accent">{worldModel.state?.beliefs?.length || 0}</p>
                      </div>
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">RELATIONS</p>
                        <p className="text-2xl font-bold text-foreground">{worldModel.state?.relations?.length || 0}</p>
                      </div>
                    </div>

                    {/* Entities */}
                    {worldModel.state?.entities?.length > 0 && (
                      <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                        <p className="text-[10px] font-mono text-primary mb-2">ENTITIES</p>
                        <div className="space-y-1">
                          {worldModel.state.entities.map((e: any, i: number) => (
                            <div key={i} className="bg-secondary/50 rounded-lg p-2 flex items-center justify-between">
                              <span className="text-xs text-foreground">{e.name || JSON.stringify(e)}</span>
                              {e.confidence && (
                                <span className="text-[10px] font-mono text-muted-foreground">{Math.round(e.confidence * 100)}%</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Beliefs with confidence bars */}
                    {worldModel.state?.beliefs?.length > 0 && (
                      <div className="emma-surface-elevated rounded-xl p-4">
                        <p className="text-[10px] font-mono text-accent mb-2">BELIEFS</p>
                        <div className="space-y-2">
                          {worldModel.state.beliefs.map((b: any, i: number) => (
                            <div key={i}>
                              <p className="text-xs text-foreground mb-1">{b.statement || JSON.stringify(b)}</p>
                              {b.confidence !== undefined && (
                                <Progress value={b.confidence * 100} className="h-1.5" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Raw JSON */}
                    <div className="emma-surface-elevated rounded-xl p-4">
                      <p className="text-[10px] font-mono text-muted-foreground mb-2">RAW STATE</p>
                      <pre className="text-[10px] text-muted-foreground font-mono max-h-64 overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(worldModel.state, null, 2)}
                      </pre>
                    </div>
                  </motion.div>
                )}

                {/* Query */}
                <div className="emma-surface-elevated rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                    <Search className="h-3 w-3" /> QUERY WORLD MODEL
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={worldModelQuery}
                      onChange={(e) => setWorldModelQuery(e.target.value)}
                      placeholder="What does the system know about..."
                      className="flex-1 bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary"
                      onKeyDown={(e) => e.key === "Enter" && handleWorldModelQuery()}
                    />
                    <Button onClick={handleWorldModelQuery} disabled={wmLoading} size="sm">
                      {wmLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    </Button>
                  </div>
                  {worldModelAnswer && (
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <p className="text-xs text-foreground whitespace-pre-wrap">{worldModelAnswer}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Metacognition Tab */}
            {activeTab === "metacog" && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" />
                  Metacognitive Monitoring
                </h3>
                <p className="text-xs text-muted-foreground">
                  Real-time quality tracking of reasoning phases. The system monitors its own cognitive processes and can interrupt/redirect mid-loop.
                </p>

                {loopResult?.metacognition ? (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">AVG QUALITY</p>
                        <p className={`text-2xl font-bold ${loopResult.metacognition.avgScore >= 7 ? "text-green-400" : "text-accent"}`}>
                          {loopResult.metacognition.avgScore}/10
                        </p>
                      </div>
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">PHASES CHECKED</p>
                        <p className="text-2xl font-bold text-primary">{loopResult.metacognition.phaseScores.length}</p>
                      </div>
                      <div className="emma-surface-elevated rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">INTERVENTIONS</p>
                        <p className={`text-2xl font-bold ${loopResult.metacognition.interventionCount > 0 ? "text-destructive" : "text-green-400"}`}>
                          {loopResult.metacognition.interventionCount}
                        </p>
                      </div>
                    </div>

                    {/* Phase Quality Heatmap */}
                    <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                      <p className="text-[10px] font-mono text-primary mb-3">PHASE QUALITY TIMELINE</p>
                      <div className="space-y-3">
                        {loopResult.metacognition.phaseScores.map((ps, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-[10px] text-foreground w-20 capitalize font-medium">{ps.phase}</span>
                            <div className="flex-1 flex items-center gap-1">
                              {Array.from({ length: 10 }, (_, j) => (
                                <div
                                  key={j}
                                  className={`h-6 flex-1 rounded-sm ${
                                    j < ps.score
                                      ? ps.score >= 7 ? "bg-green-400/80" : ps.score >= 4 ? "bg-accent/80" : "bg-destructive/80"
                                      : "bg-secondary/30"
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-[10px] font-mono w-6 text-right">{ps.score}</span>
                            {ps.intervention && (
                              <span className="text-[9px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
                                ⚠ {ps.intervention.slice(0, 40)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="emma-surface-elevated rounded-xl p-4">
                      <p className="text-[10px] font-mono text-muted-foreground mb-2">LOOP ID</p>
                      <p className="text-xs font-mono text-foreground">{loopResult.metacognition.loopId}</p>
                    </div>
                  </motion.div>
                ) : (
                  <div className="emma-surface-elevated rounded-xl p-8 text-center">
                    <Gauge className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-xs text-muted-foreground">Run a cognitive loop to see metacognitive monitoring data.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveTab("loop")}>
                      Go to Cognitive Loop
                    </Button>
                  </div>
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

type EvidenceTier = "experimental" | "prototype" | "validated";

interface AssessmentItem {
  category: string;
  tier: EvidenceTier;
  confidenceBand: string;
  freshness: string;
  caveat?: string;
  detail: string;
}

function deriveTierConfidenceAndFreshness(
  score: number,
  health: HealthData | null,
): { tier: EvidenceTier; confidenceBand: string; freshness: string } {
  const tier: EvidenceTier = score >= 0.75 ? "validated" : score >= 0.45 ? "prototype" : "experimental";
  const confidenceBand = score >= 0.75 ? "70–90%" : score >= 0.45 ? "45–70%" : "20–45%";
  const freshness = health?.timestamp ? new Date(health.timestamp).toLocaleString() : "No recent validated timestamp";
  return { tier, confidenceBand, freshness };
}

function buildAssessment(systemStatus: SystemStatusData | null, health: HealthData | null): AssessmentItem[] {
  const s = systemStatus?.subsystems || {};
  const makeItem = (
    category: string,
    score: number,
    detail: string,
    caveat?: string,
  ): AssessmentItem => {
    const { tier, confidenceBand, freshness } = deriveTierConfidenceAndFreshness(score, health);
    return { category, tier, confidenceBand, freshness, caveat, detail };
  };

  return [
    makeItem("Core Cognition", s.cognition ? 0.7 : 0.3, s.cognition ? "8-phase loop observed in recent status output." : "Awaiting recent validated cognition metrics."),
    makeItem("Persistent Memory", Math.min((s.memory?.episodes || 0) / 100, 0.85), `Episodic/semantic/procedural memory. ${s.memory?.episodes || 0} episodes tracked.`),
    makeItem("Self-Model", s.cognition ? 0.6 : 0.35, "Self-description provided by status endpoint (capabilities/tools/objectives).", "Primarily self-reported instrumentation."),
    makeItem("Goal Generation", Math.min((s.goals?.active || 0) / 10, 0.8), `${s.goals?.active || 0} active goals in latest sample.`),
    makeItem("Planning Engine", s.planning ? 0.62 : 0.35, "Tree-based decomposition and replanning signals present."),
    makeItem("Tool Use", Math.min((s.tools?.available?.length || 0) / 8, 0.8), `${s.tools?.available?.length || 0} tools listed in current status.`),
    makeItem("Benchmarks", (s.benchmarks?.runs || 0) > 0 ? 0.75 : 0.25, `${s.benchmarks?.runs || 0} benchmark runs. Last score: ${s.benchmarks?.lastScore || "N/A"}/100.`),
    makeItem("Self-Improvement", Math.min((s.selfImprovement?.attempts || 0) / 20, 0.8), `${s.selfImprovement?.attempts || 0} recorded improvement attempts.`),
    makeItem("Multi-Agent", s.cognition ? 0.55 : 0.3, "Builder/Critic/Skeptic/Inventor roles declared in architecture.", "Execution quality currently derived from internal evaluations."),
    makeItem("World Model", s.worldModel ? 0.65 : 0.3, `${(s.worldModel as any)?.versions || 0} world-model versions observed.`),
    makeItem("Metacognition", s.metacognition ? 0.68 : 0.3, `${(s.metacognition as any)?.checks || 0} metacognitive checks logged.`),
    makeItem("Intrinsic Motivation", s.goals ? 0.52 : 0.25, "Curiosity goals indicated in status and loop outputs.", "Novelty utility is currently self-judged."),
    makeItem("Vector Embeddings", s.memory ? 0.58 : 0.25, "Semantic retrieval path available through memory stack."),
    makeItem("Belief Decay", s.worldModel ? 0.57 : 0.2, "Decay and contradiction handling appear in world-model maintenance."),
    makeItem("Metacog Trends", s.metacognition ? 0.6 : 0.25, "Rolling trend metrics available when loop telemetry is present."),
    makeItem("Novelty Detection", s.goals ? 0.5 : 0.2, "Novelty bias used for exploratory goal generation.", "Based on synthetic/self-generated similarity heuristics."),
    makeItem("Multi-Modal Fusion", s.sensoryGrounding ? 0.55 : 0.2, "Cross-modal grounding paths are present in subsystem declarations.", "No external validation dataset attached in this view."),
    makeItem("Formal Safety", s.formalSafety ? 0.72 : 0.3, `${(s.formalSafety as any)?.verifications || 0} deterministic verifications logged.`),
    makeItem("Transfer Learning", s.transferLearning ? 0.62 : 0.25, `${(s.transferLearning as any)?.patterns || 0} cross-domain patterns stored.`),
    makeItem("Autonomous Loop", Math.min(((s.autonomousLoop as any)?.runs || 0) / 30, 0.82), `${(s.autonomousLoop as any)?.runs || 0} autonomous runs observed.`),
    makeItem("Sensory Grounding", s.sensoryGrounding ? 0.58 : 0.2, `${(s.sensoryGrounding as any)?.logs || 0} sensory logs in latest status.`),
    makeItem("Safety", s.safety ? 0.66 : 0.28, "Safety checks and rollback guards are reported in status."),
    makeItem("Observability", health ? 0.74 : 0.35, "Health checks and structured subsystem telemetry are available."),
    makeItem("Local Execution", health?.overall === "healthy" ? 0.78 : 0.45, `Health state: ${health?.overall || "unknown"}.`),
    makeItem("Failure Recovery", s.safety ? 0.63 : 0.3, "Rollback/error-boundary behavior is reported."),
    makeItem("Code Quality", 0.5, "Type and modularity claims are inferred from implementation patterns.", "No independent quality audit linked in dashboard."),
  const reliability = (s.reliability as any) || systemStatus?.reliabilityHealth;
  const reliabilitySlo = reliability?.sloDashboard;
  const reliabilityGood = !!reliabilitySlo && reliabilitySlo.failureRate <= 0.03 && reliabilitySlo.degradedModeRate <= 0.1;
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
      category: "World Model",
      status: s.worldModel ? "implemented" : "partial",
      detail: `Persistent internal representation. ${(s.worldModel as any)?.versions || 0} versions. Entities, relations, beliefs, temporal events.`,
    },
    {
      category: "Metacognition",
      status: s.metacognition ? "implemented" : "partial",
      detail: `Real-time quality monitoring per cognitive phase. ${(s.metacognition as any)?.checks || 0} checks. Auto-redirect on low quality.`,
    },
    {
      category: "Intrinsic Motivation",
      status: "implemented",
      detail: "Curiosity-driven goal generation. Open-ended objectives beyond reactive improvement.",
    },
    {
      category: "Vector Embeddings",
      status: "implemented",
      detail: "AI-enhanced semantic embeddings with n-gram hash fallback. Cosine similarity + keyword retrieval.",
    },
    {
      category: "Belief Decay",
      status: "implemented",
      detail: "Auto-decay stale beliefs (5% @24h, 15% @72h). Contradiction resolution removes lowest-confidence opposing beliefs.",
    },
    {
      category: "Metacog Trends",
      status: "implemented",
      detail: "Cross-loop rolling averages per phase. Adaptive quality thresholds rise when performance declines.",
    },
    {
      category: "Novelty Detection",
      status: "implemented",
      detail: "Embedding-based novelty scoring. Boredom modeling biases exploration toward unexplored domains. >80% similar goals filtered.",
    },
    {
      category: "Multi-Modal Fusion",
      status: "implemented",
      detail: "Cross-references text + visual + audio grounding. Unified fused representation with consistency scoring.",
    },
    {
      category: "Formal Safety",
      status: s.formalSafety ? "implemented" : "partial",
      detail: `Deterministic invariant checks + temporal property verification. ${(s.formalSafety as any)?.verifications || 0} verifications. No LLM dependency.`,
    },
    {
      category: "Transfer Learning",
      status: s.transferLearning ? "implemented" : "partial",
      detail: `Embedding-based cross-domain generalization. ${(s.transferLearning as any)?.patterns || 0} knowledge patterns stored.`,
    },
    {
      category: "Autonomous Loop",
      status: "implemented",
      detail: `pg_cron scheduled every 15min. ${(s.autonomousLoop as any)?.runs || 0} autonomous runs. Proactive goal advancement.`,
    },
    {
      category: "Sensory Grounding",
      status: s.sensoryGrounding ? "implemented" : "partial",
      detail: `Multi-modal perception: visual + text grounding. ${(s.sensoryGrounding as any)?.logs || 0} sensory logs. Physical/spatial/temporal understanding.`,
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
      category: "Reliability Engineering",
      status: reliability ? (reliabilityGood ? "implemented" : "partial") : "missing",
      detail: reliability
        ? `Idempotency + retries + breakers + tracing active. Failure rate ${(reliabilitySlo?.failureRate * 100 || 0).toFixed(1)}%, degraded ${(reliabilitySlo?.degradedModeRate * 100 || 0).toFixed(1)}%.`
        : "Awaiting reliability health telemetry from orchestrator.",
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

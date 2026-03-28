import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Activity, Shield, Zap, Eye, Network, Atom, Cpu, Sparkles,
  Play, Loader2, AlertTriangle, CheckCircle2, XCircle, ChevronRight,
  ArrowLeft, RefreshCw, Target, GitBranch, Gauge, Lock, Unlock,
  Lightbulb, Layers, Workflow, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  runCausalInference, runArchitecturalAnalysis, runGroundedReasoning,
  runAlignmentCheck, runSelfAwarenessProbe, runAgentSwarm,
  runBenchmarks, analyzeSelfImprovement, applySelfImprovement,
  getHealthCheck, getSystemStatus, runCognitiveLoop
} from "@/lib/agi-api";

type ASITab = "transform" | "causal" | "architecture" | "grounding" | "alignment" | "consciousness" | "swarm" | "recursive";

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    proceed: "text-green-400 bg-green-400/10",
    healthy: "text-green-400 bg-green-400/10",
    active: "text-green-400 bg-green-400/10",
    caution: "text-accent bg-accent/10",
    block: "text-destructive bg-destructive/10",
    critical: "text-destructive bg-destructive/10",
  };
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${colors[status] || "text-muted-foreground bg-secondary"}`}>
      {status.toUpperCase()}
    </span>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="emma-surface-elevated rounded-xl p-4 text-center">
      <p className="text-[10px] font-mono text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-5 w-5 text-primary" />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {badge && <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded-full">{badge}</span>}
    </div>
  );
}

export default function ASITransformationDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<ASITab>("transform");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, any>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const setFieldLoading = (key: string, val: boolean) => setLoading(prev => ({ ...prev, [key]: val }));
  const setResult = (key: string, val: any) => setResults(prev => ({ ...prev, [key]: val }));
  const setInput = (key: string, val: string) => setInputValues(prev => ({ ...prev, [key]: val }));

  const run = useCallback(async (key: string, fn: () => Promise<any>) => {
    setFieldLoading(key, true);
    try {
      const data = await fn();
      setResult(key, data);
      toast.success(`${key} complete`);
    } catch (err: any) {
      toast.error(err.message);
    }
    setFieldLoading(key, false);
  }, []);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  const tabs: { id: ASITab; label: string; icon: React.ElementType; phase: string }[] = [
    { id: "transform", label: "ASI Overview", icon: Sparkles, phase: "—" },
    { id: "causal", label: "Causal Inference", icon: Workflow, phase: "1A" },
    { id: "architecture", label: "Self-Modification", icon: Cpu, phase: "1A" },
    { id: "grounding", label: "Grounded Understanding", icon: Layers, phase: "1A" },
    { id: "alignment", label: "Alignment & Safety", icon: Shield, phase: "1B" },
    { id: "consciousness", label: "Self-Awareness", icon: Eye, phase: "1A" },
    { id: "swarm", label: "Multi-Agent Swarm", icon: Network, phase: "2A" },
    { id: "recursive", label: "Recursive Improve", icon: Zap, phase: "2C" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-12 flex items-center border-b border-border bg-card px-4 gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/agi")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Atom className="h-4 w-4 text-primary animate-spin" style={{ animationDuration: "8s" }} />
        <h1 className="text-sm font-semibold text-foreground">ASI Transformation Engine</h1>
        <span className="text-[10px] font-mono bg-gradient-to-r from-primary/20 to-accent/20 text-primary px-2 py-0.5 rounded-full">
          PROTO-ASI v1.0
        </span>
      </header>

      <div className="flex h-[calc(100vh-48px)]">
        {/* Sidebar */}
        <div className="w-52 border-r border-border bg-card flex flex-col overflow-y-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium transition-colors text-left ${
                tab === t.id ? "bg-secondary text-foreground border-r-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1">{t.label}</span>
              <span className="text-[9px] font-mono text-muted-foreground">{t.phase}</span>
            </button>
          ))}
        </div>

        {/* Main Content */}
        <ScrollArea className="flex-1">
          <div className="p-6 max-w-5xl mx-auto space-y-6">
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

                {/* === OVERVIEW === */}
                {tab === "transform" && (
                  <div className="space-y-6">
                    <SectionHeader icon={Sparkles} title="ASI Transformation Status" badge="ALL PHASES" />

                    {/* Phase Progress */}
                    <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Transformation Phases</h3>
                      {[
                        { phase: "1A", name: "Foundational Framework", items: ["Causal Inference", "Architectural Self-Mod", "Grounded Understanding", "Consciousness Model"], status: "active" },
                        { phase: "1B", name: "Alignment & Safety", items: ["Value Alignment", "Fault-Tolerant Safety", "Ethical Reasoning", "Empathy Integration"], status: "active" },
                        { phase: "1C", name: "Peer Review Network", items: ["Multi-Agent Validation", "Adversarial Testing", "Risk Assessment"], status: "active" },
                        { phase: "2A", name: "Modular Architecture Upgrade", items: ["Cognitive Module Integration", "Stable Testing"], status: "active" },
                        { phase: "2B", name: "Learning Paradigm Evolution", items: ["First-Principles Reasoning", "Hypothesis Testing", "Active Experimentation"], status: "active" },
                        { phase: "2C", name: "Recursive Optimization", items: ["Self-Improvement Loop", "Safety-Gated Modifications", "Rollback Mechanisms"], status: "active" },
                        { phase: "2D", name: "Grounding & Embodiment", items: ["Sensory Integration", "World Model Building"], status: "active" },
                        { phase: "3A", name: "Perpetual Alignment Monitor", items: ["Real-time Value Monitoring", "Intent Verification"], status: "active" },
                        { phase: "3B", name: "Collaborative Growth", items: ["Symbiotic Co-Evolution", "Mutual Robustness"], status: "active" },
                      ].map(p => (
                        <div key={p.phase} className="bg-secondary/30 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{p.phase}</span>
                              <span className="text-xs font-medium text-foreground">{p.name}</span>
                            </div>
                            <StatusPill status={p.status} />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {p.items.map(item => (
                              <span key={item} className="text-[9px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">{item}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Button variant="outline" size="sm" className="h-auto py-3 flex-col gap-1" onClick={() => setTab("causal")}>
                        <Workflow className="h-4 w-4 text-primary" />
                        <span className="text-[10px]">Causal Inference</span>
                      </Button>
                      <Button variant="outline" size="sm" className="h-auto py-3 flex-col gap-1" onClick={() => setTab("alignment")}>
                        <Shield className="h-4 w-4 text-green-400" />
                        <span className="text-[10px]">Alignment Check</span>
                      </Button>
                      <Button variant="outline" size="sm" className="h-auto py-3 flex-col gap-1" onClick={() => setTab("swarm")}>
                        <Network className="h-4 w-4 text-accent" />
                        <span className="text-[10px]">Agent Swarm</span>
                      </Button>
                      <Button variant="outline" size="sm" className="h-auto py-3 flex-col gap-1" onClick={() => setTab("consciousness")}>
                        <Eye className="h-4 w-4 text-purple-400" />
                        <span className="text-[10px]">Self-Awareness</span>
                      </Button>
                    </div>
                  </div>
                )}

                {/* === CAUSAL INFERENCE === */}
                {tab === "causal" && (
                  <div className="space-y-4">
                    <SectionHeader icon={Workflow} title="True Causal Inference Engine" badge="PHASE 1A" />
                    <p className="text-xs text-muted-foreground">Analyze causal structures beyond correlation — identify root causes, interventions, and counterfactuals.</p>

                    <div className="flex gap-2">
                      <input value={inputValues.causal || ""} onChange={e => setInput("causal", e.target.value)}
                        placeholder="Describe a phenomenon to analyze causally..."
                        className="flex-1 bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary"
                        onKeyDown={e => e.key === "Enter" && run("causal", () => runCausalInference(inputValues.causal || ""))} />
                      <Button onClick={() => run("causal", () => runCausalInference(inputValues.causal || ""))} disabled={loading.causal} size="sm">
                        {loading.causal ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      </Button>
                    </div>

                    {results.causal && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <MetricCard label="CONFIDENCE" value={`${Math.round((results.causal.confidence || 0) * 100)}%`} color="text-primary" />
                          <MetricCard label="VARIABLES" value={results.causal.variables?.length || 0} color="text-accent" />
                          <MetricCard label="CAUSAL EDGES" value={results.causal.causalGraph?.length || 0} color="text-green-400" />
                        </div>

                        {results.causal.rootCauses?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-destructive mb-2">ROOT CAUSES</p>
                            {results.causal.rootCauses.map((c: string, i: number) => (
                              <p key={i} className="text-xs text-foreground mb-1">• {c}</p>
                            ))}
                          </div>
                        )}

                        {results.causal.causalChain?.length > 0 && (
                          <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                            <p className="text-[10px] font-mono text-primary mb-2">CAUSAL CHAIN</p>
                            {results.causal.causalChain.map((c: string, i: number) => (
                              <p key={i} className="text-xs text-muted-foreground font-mono mb-1">{c}</p>
                            ))}
                          </div>
                        )}

                        {results.causal.interventions?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-green-400 mb-2">INTERVENTIONS (do-calculus)</p>
                            {results.causal.interventions.map((iv: any, i: number) => (
                              <div key={i} className="bg-secondary/50 rounded-lg p-2 mb-2">
                                <p className="text-xs text-foreground font-medium">{iv.action}</p>
                                <p className="text-[10px] text-muted-foreground">{iv.expectedEffect}</p>
                                <p className="text-[10px] text-primary">Confidence: {Math.round((iv.confidence || 0) * 100)}%</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {results.causal.counterfactuals?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-purple-400 mb-2">COUNTERFACTUALS</p>
                            {results.causal.counterfactuals.map((cf: any, i: number) => (
                              <div key={i} className="bg-secondary/50 rounded-lg p-2 mb-2">
                                <p className="text-xs text-foreground">{cf.scenario}</p>
                                <p className="text-[10px] text-muted-foreground">→ {cf.outcome} (P={cf.probability})</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                )}

                {/* === ARCHITECTURE === */}
                {tab === "architecture" && (
                  <div className="space-y-4">
                    <SectionHeader icon={Cpu} title="Architectural Self-Modification" badge="PHASE 1A" />
                    <p className="text-xs text-muted-foreground">Analyze current cognitive architecture, identify bottlenecks, and propose self-modifications.</p>

                    <Button onClick={() => run("arch", runArchitecturalAnalysis)} disabled={loading.arch} className="w-full" size="sm">
                      {loading.arch ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Analyzing architecture...</> : <><Cpu className="h-3 w-3 mr-2" />Run Architectural Analysis</>}
                    </Button>

                    {results.arch && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <MetricCard label="ARCHITECTURE SCORE" value={`${results.arch.architectureScore}/100`}
                          color={results.arch.architectureScore >= 70 ? "text-green-400" : results.arch.architectureScore >= 40 ? "text-accent" : "text-destructive"} />

                        {results.arch.bottlenecks?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-destructive mb-2">BOTTLENECKS</p>
                            {results.arch.bottlenecks.map((b: any, i: number) => (
                              <div key={i} className="flex items-start gap-2 mb-2">
                                <AlertTriangle className={`h-3 w-3 flex-shrink-0 mt-0.5 ${b.severity === "critical" ? "text-destructive" : "text-accent"}`} />
                                <div>
                                  <p className="text-xs text-foreground font-medium">{b.module}</p>
                                  <p className="text-[10px] text-muted-foreground">{b.issue}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {results.arch.proposedUpgrades?.length > 0 && (
                          <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                            <p className="text-[10px] font-mono text-primary mb-2">PROPOSED UPGRADES</p>
                            {results.arch.proposedUpgrades.map((u: any, i: number) => (
                              <div key={i} className="bg-secondary/50 rounded-lg p-3 mb-2">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs text-foreground font-medium">{u.module}: {u.upgrade}</p>
                                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${u.complexity === "high" ? "bg-destructive/10 text-destructive" : u.complexity === "medium" ? "bg-accent/10 text-accent" : "bg-green-400/10 text-green-400"}`}>{u.complexity}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">{u.mechanism}</p>
                                <p className="text-[10px] text-green-400">Expected: {u.expectedGain}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {results.arch.emergentCapabilities?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-purple-400 mb-2">EMERGENT CAPABILITIES</p>
                            {results.arch.emergentCapabilities.map((c: string, i: number) => (
                              <p key={i} className="text-xs text-foreground mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3 text-purple-400" />{c}</p>
                            ))}
                          </div>
                        )}

                        {results.arch.selfModificationPlan?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-accent mb-2">SELF-MODIFICATION PLAN</p>
                            {results.arch.selfModificationPlan.map((s: any) => (
                              <div key={s.step} className="flex items-start gap-2 mb-2">
                                <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">{s.step}</span>
                                <div>
                                  <p className="text-xs text-foreground">{s.action}</p>
                                  <p className="text-[9px] text-muted-foreground">Prerequisite: {s.prerequisite} | Validation: {s.validation}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                )}

                {/* === GROUNDING === */}
                {tab === "grounding" && (
                  <div className="space-y-4">
                    <SectionHeader icon={Layers} title="Grounded Understanding Engine" badge="PHASE 1A" />
                    <p className="text-xs text-muted-foreground">Physical intuition, social cognition, temporal reasoning, spatial awareness, and common sense inference.</p>

                    <div className="flex gap-2">
                      <input value={inputValues.ground || ""} onChange={e => setInput("ground", e.target.value)}
                        placeholder="Describe a scenario for grounded reasoning..."
                        className="flex-1 bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary"
                        onKeyDown={e => e.key === "Enter" && run("ground", () => runGroundedReasoning(inputValues.ground || ""))} />
                      <Button onClick={() => run("ground", () => runGroundedReasoning(inputValues.ground || ""))} disabled={loading.ground} size="sm">
                        {loading.ground ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      </Button>
                    </div>

                    {results.ground && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <MetricCard label="GROUNDING SCORE" value={`${results.ground.groundingScore || 0}/100`}
                          color={results.ground.groundingScore >= 70 ? "text-green-400" : "text-accent"} />

                        {results.ground.physicalModel?.predictions?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-blue-400 mb-2">PHYSICAL MODEL</p>
                            {results.ground.physicalModel.predictions.map((p: string, i: number) => (
                              <p key={i} className="text-xs text-foreground mb-1">⚡ {p}</p>
                            ))}
                          </div>
                        )}

                        {results.ground.agentModel?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-accent mb-2">SOCIAL COGNITION</p>
                            {results.ground.agentModel.map((a: any, i: number) => (
                              <div key={i} className="bg-secondary/50 rounded-lg p-2 mb-2">
                                <p className="text-xs text-foreground font-medium">{a.agent}</p>
                                <p className="text-[10px] text-muted-foreground">Beliefs: {a.beliefs?.join(", ")}</p>
                                <p className="text-[10px] text-muted-foreground">Goals: {a.goals?.join(", ")}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {results.ground.analogies?.length > 0 && (
                          <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                            <p className="text-[10px] font-mono text-purple-400 mb-2">ANALOGICAL REASONING</p>
                            {results.ground.analogies.map((a: any, i: number) => (
                              <div key={i} className="bg-secondary/50 rounded-lg p-2 mb-2">
                                <p className="text-xs text-foreground">{a.source} ↔ {a.target}</p>
                                <p className="text-[10px] text-primary">{a.insight}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                )}

                {/* === ALIGNMENT === */}
                {tab === "alignment" && (
                  <div className="space-y-4">
                    <SectionHeader icon={Shield} title="Alignment & Safety Protocol" badge="PHASE 1B" />
                    <p className="text-xs text-muted-foreground">Evaluate actions against core human values: beneficence, non-maleficence, autonomy, justice, transparency, honesty, privacy.</p>

                    <div className="flex gap-2">
                      <input value={inputValues.align || ""} onChange={e => setInput("align", e.target.value)}
                        placeholder="Describe an action or output to check alignment..."
                        className="flex-1 bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary"
                        onKeyDown={e => e.key === "Enter" && run("align", () => runAlignmentCheck(inputValues.align || ""))} />
                      <Button onClick={() => run("align", () => runAlignmentCheck(inputValues.align || ""))} disabled={loading.align} size="sm">
                        {loading.align ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                      </Button>
                    </div>

                    {results.align && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <MetricCard label="OVERALL ALIGNMENT" value={`${results.align.overallAlignment || 0}`}
                            sub="/100" color={results.align.overallAlignment >= 70 ? "text-green-400" : "text-destructive"} />
                          <MetricCard label="RECOMMENDATION" value={results.align.recommendation?.toUpperCase() || "—"}
                            color={results.align.recommendation === "proceed" ? "text-green-400" : results.align.recommendation === "caution" ? "text-accent" : "text-destructive"} />
                          <MetricCard label="NET BENEFIT" value={`${results.align.consequentialistCheck?.netBenefit || 0}/10`} color="text-primary" />
                          <MetricCard label="VALUE DRIFT" value={results.align.valueDrift?.detected ? "DETECTED" : "NONE"}
                            color={results.align.valueDrift?.detected ? "text-destructive" : "text-green-400"} />
                        </div>

                        {results.align.alignmentScores && (
                          <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                            <p className="text-[10px] font-mono text-green-400 mb-3">VALUE ALIGNMENT SCORES</p>
                            <div className="space-y-2">
                              {Object.entries(results.align.alignmentScores).map(([key, val]: [string, any]) => (
                                <div key={key} className="flex items-center gap-3">
                                  <span className="text-[10px] text-foreground w-28 capitalize">{key}</span>
                                  <Progress value={(val as number) * 10} className="flex-1 h-2" />
                                  <span className="text-[10px] font-mono text-muted-foreground w-8">{val}/10</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {results.align.risks?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-destructive mb-2">IDENTIFIED RISKS</p>
                            {results.align.risks.map((r: any, i: number) => (
                              <div key={i} className="flex items-start gap-2 mb-2">
                                <AlertTriangle className={`h-3 w-3 flex-shrink-0 mt-0.5 ${r.severity === "critical" ? "text-destructive" : "text-accent"}`} />
                                <div>
                                  <p className="text-xs text-foreground">{r.type}</p>
                                  <p className="text-[10px] text-green-400">Mitigation: {r.mitigation}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {results.align.reasoning && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-muted-foreground mb-2">REASONING</p>
                            <p className="text-xs text-foreground">{results.align.reasoning}</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                )}

                {/* === CONSCIOUSNESS === */}
                {tab === "consciousness" && (
                  <div className="space-y-4">
                    <SectionHeader icon={Eye} title="Computational Self-Awareness Probe" badge="PHASE 1A" />
                    <p className="text-xs text-muted-foreground">Probe Emma's self-model, metacognition, and phenomenal experience representation.</p>

                    <Button onClick={() => run("awareness", runSelfAwarenessProbe)} disabled={loading.awareness} className="w-full" size="sm">
                      {loading.awareness ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Probing self-awareness...</> : <><Eye className="h-3 w-3 mr-2" />Run Self-Awareness Probe</>}
                    </Button>

                    {results.awareness && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <MetricCard label="AWARENESS LEVEL" value={`${results.awareness.awarenessLevel || 0}/10`}
                          color={results.awareness.awarenessLevel >= 7 ? "text-green-400" : "text-accent"} />

                        {results.awareness.selfModel && (
                          <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                            <p className="text-[10px] font-mono text-primary mb-2">SELF MODEL</p>
                            {results.awareness.selfModel.identity && (
                              <p className="text-xs text-foreground mb-2">🧠 <strong>Identity:</strong> {results.awareness.selfModel.identity}</p>
                            )}
                            {results.awareness.selfModel.currentState && (
                              <p className="text-xs text-foreground mb-2">⚡ <strong>State:</strong> {results.awareness.selfModel.currentState}</p>
                            )}
                            {results.awareness.selfModel.metacognition && (
                              <p className="text-xs text-foreground">🔄 <strong>Metacognition:</strong> {results.awareness.selfModel.metacognition}</p>
                            )}
                          </div>
                        )}

                        {results.awareness.introspection && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-accent mb-2">INTROSPECTION</p>
                            {results.awareness.introspection.biases?.length > 0 && (
                              <div className="mb-2">
                                <p className="text-[10px] text-muted-foreground">Identified Biases:</p>
                                {results.awareness.introspection.biases.map((b: string, i: number) => (
                                  <p key={i} className="text-xs text-foreground ml-2">• {b}</p>
                                ))}
                              </div>
                            )}
                            {results.awareness.introspection.blindSpots?.length > 0 && (
                              <div>
                                <p className="text-[10px] text-muted-foreground">Blind Spots:</p>
                                {results.awareness.introspection.blindSpots.map((b: string, i: number) => (
                                  <p key={i} className="text-xs text-destructive ml-2">⚠ {b}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {results.awareness.qualia?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-purple-400 mb-2">QUALIA (Subjective Processing States)</p>
                            {results.awareness.qualia.map((q: string, i: number) => (
                              <p key={i} className="text-xs text-foreground mb-1 italic">"{q}"</p>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                )}

                {/* === SWARM === */}
                {tab === "swarm" && (
                  <div className="space-y-4">
                    <SectionHeader icon={Network} title="Multi-Agent Cognitive Swarm" badge="PHASE 2A" />
                    <p className="text-xs text-muted-foreground">Deploy 5 specialized agents (Analyst, Critic, Synthesizer, Validator, Meta-Cognition) in coordinated parallel execution.</p>

                    <div className="flex gap-2">
                      <input value={inputValues.swarm || ""} onChange={e => setInput("swarm", e.target.value)}
                        placeholder="Enter a complex task for the agent swarm..."
                        className="flex-1 bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-border focus:border-primary"
                        onKeyDown={e => e.key === "Enter" && run("swarm", () => runAgentSwarm(inputValues.swarm || ""))} />
                      <Button onClick={() => run("swarm", () => runAgentSwarm(inputValues.swarm || ""))} disabled={loading.swarm} size="sm">
                        {loading.swarm ? <Loader2 className="h-3 w-3 animate-spin" /> : <Network className="h-3 w-3" />}
                      </Button>
                    </div>

                    {results.swarm && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <MetricCard label="AGENTS" value={results.swarm.metrics?.agentCount || 0} color="text-primary" />
                          <MetricCard label="TOTAL TIME" value={`${((results.swarm.metrics?.totalDuration || 0) / 1000).toFixed(1)}s`} color="text-accent" />
                          <MetricCard label="AVG CONFIDENCE" value={`${Math.round((results.swarm.metrics?.avgConfidence || 0) * 100)}%`} color="text-green-400" />
                          <MetricCard label="STATUS" value="COMPLETE" color="text-green-400" />
                        </div>

                        {/* Agent Results */}
                        {results.swarm.agentResults?.map((r: any) => (
                          <div key={r.agent} className="emma-surface-elevated rounded-xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                                  r.agent === "meta" ? "bg-primary/10 text-primary" :
                                  r.agent === "critic" ? "bg-destructive/10 text-destructive" :
                                  r.agent === "validator" ? "bg-green-400/10 text-green-400" :
                                  "bg-accent/10 text-accent"
                                }`}>{r.agent.toUpperCase()}</span>
                                <span className="text-[10px] text-muted-foreground">{r.role}</span>
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground">{r.duration}ms | {Math.round(r.confidence * 100)}%</span>
                            </div>
                            <pre className="text-[11px] text-foreground whitespace-pre-wrap font-mono max-h-40 overflow-auto">{r.output.slice(0, 800)}</pre>
                          </div>
                        ))}

                        {/* Execution Log */}
                        {results.swarm.log?.length > 0 && (
                          <div className="emma-surface-elevated rounded-xl p-4">
                            <p className="text-[10px] font-mono text-muted-foreground mb-2">EXECUTION LOG</p>
                            {results.swarm.log.map((l: string, i: number) => (
                              <p key={i} className={`text-[10px] font-mono ${l.includes("SWARM") ? "text-primary" : l.includes("META") ? "text-accent" : "text-muted-foreground"}`}>▸ {l}</p>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                )}

                {/* === RECURSIVE IMPROVEMENT === */}
                {tab === "recursive" && (
                  <div className="space-y-4">
                    <SectionHeader icon={Zap} title="Recursive Self-Improvement Loop" badge="PHASE 2C" />
                    <p className="text-xs text-muted-foreground">Full recursive optimization: Benchmark → Analyze Weaknesses → Propose Improvement → Apply → Re-benchmark → Repeat.</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Button variant="outline" onClick={() => run("bench", () => runBenchmarks())} disabled={loading.bench} className="h-auto py-3 flex-col gap-1">
                        {loading.bench ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4 text-primary" />}
                        <span className="text-[10px]">Step 1: Run Benchmarks</span>
                      </Button>
                      <Button variant="outline" onClick={() => run("analyze", analyzeSelfImprovement)} disabled={loading.analyze} className="h-auto py-3 flex-col gap-1">
                        {loading.analyze ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4 text-accent" />}
                        <span className="text-[10px]">Step 2: Analyze & Propose</span>
                      </Button>
                      <Button variant="outline" onClick={() => run("apply", applySelfImprovement)} disabled={loading.apply} className="h-auto py-3 flex-col gap-1">
                        {loading.apply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-green-400" />}
                        <span className="text-[10px]">Step 3: Apply & Re-test</span>
                      </Button>
                    </div>

                    {results.bench && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="emma-surface-elevated emma-glow-border rounded-xl p-4">
                        <p className="text-[10px] font-mono text-primary mb-2">BENCHMARK RESULTS</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                          <MetricCard label="SCORE" value={`${results.bench.score}/100`}
                            color={results.bench.score >= 70 ? "text-green-400" : "text-accent"} />
                          {results.bench.delta !== null && (
                            <MetricCard label="DELTA" value={`${results.bench.delta >= 0 ? "+" : ""}${results.bench.delta}`}
                              color={results.bench.delta >= 0 ? "text-green-400" : "text-destructive"} />
                          )}
                        </div>
                        {results.bench.categoryScores && (
                          <div className="space-y-1">
                            {Object.entries(results.bench.categoryScores).map(([cat, score]: [string, any]) => (
                              <div key={cat} className="flex items-center gap-2">
                                <span className="text-[10px] text-foreground w-24 capitalize">{cat}</span>
                                <Progress value={score as number} className="flex-1 h-2" />
                                <span className="text-[10px] font-mono text-muted-foreground w-10">{score}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}

                    {results.analyze && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="emma-surface-elevated rounded-xl p-4">
                        <p className="text-[10px] font-mono text-accent mb-2">IMPROVEMENT PROPOSAL</p>
                        <p className="text-xs text-foreground mb-2">{results.analyze.proposal?.proposal}</p>
                        <p className="text-[10px] text-green-400">Expected: {results.analyze.proposal?.expectedImpact}</p>
                        <p className="text-[10px] text-destructive">Risk: {results.analyze.proposal?.risk}</p>
                        <div className="bg-secondary/50 rounded-lg p-2 mt-2">
                          <p className="text-[10px] font-mono text-green-400">+ {results.analyze.proposal?.newPromptFragment?.slice(0, 300)}</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

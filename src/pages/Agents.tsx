import { ArrowLeft, Bot, Hammer, ShieldAlert, HelpCircle, Lightbulb, Brain, Target, Database, Shield, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { AgentSwarm } from "@/components/AgentSwarm";

const COGNITIVE_AGENTS = [
  { name: "Builder", desc: "Produces the strongest possible solution. Optimistic, constructive, thorough. Generates initial response frameworks and solution architectures.", icon: Hammer, color: "text-blue-400" },
  { name: "Critic", desc: "Attacks logic, assumptions, and weak reasoning. Finds flaws ruthlessly. Challenges overconfidence and vague claims.", icon: ShieldAlert, color: "text-destructive" },
  { name: "Skeptic", desc: "Identifies missing data, uncertainty, unfalsifiable claims. Demands evidence. Forces explicit uncertainty markers.", icon: HelpCircle, color: "text-accent" },
  { name: "Inventor", desc: "Proposes fundamentally different approaches not implied by the prompt. Lateral thinking, novel abstractions, paradigm shifts.", icon: Lightbulb, color: "text-green-400" },
];

const SYSTEM_AGENTS = [
  { name: "Planner", desc: "Breaks tasks into substeps via tree-based decomposition. Scores multiple paths. Revises plans after failure.", icon: Target, color: "text-primary" },
  { name: "Memory Manager", desc: "Stores and retrieves episodic, semantic, and procedural memories. Relevance-scored retrieval for contextual decisions.", icon: Database, color: "text-purple-400" },
  { name: "Self-Improver", desc: "Analyzes benchmark weaknesses. Proposes targeted modifications. Runs sandboxed tests. Accepts only measured gains.", icon: RefreshCw, color: "text-accent" },
  { name: "Safety Validator", desc: "Blocks dangerous code patterns. Detects prompt injection. Enforces resource limits. Rollback on instability.", icon: Shield, color: "text-green-400" },
];

export default function Agents() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 flex items-center border-b border-border bg-card px-4 gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Bot className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold text-foreground">Agent Architecture</h1>
        <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">8 Agents</span>
      </header>

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-xl font-bold emma-glow-text">Multi-Agent Cognitive Architecture</h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Emma uses 4 cognitive agents for reasoning and 4 system agents for orchestration. Each serves a distinct function with real logic, not renamed prompts.
          </p>
        </div>

        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Cognitive Agents (Reasoning Pipeline)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {COGNITIVE_AGENTS.map((agent) => (
            <div key={agent.name} className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <agent.icon className={`h-4 w-4 ${agent.color}`} />
                  <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
                </div>
                <span className="text-[10px] font-mono text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">ACTIVE</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{agent.desc}</p>
            </div>
          ))}
        </div>

        <h3 className="text-sm font-medium text-foreground flex items-center gap-2 mt-8">
          <Bot className="h-4 w-4 text-accent" />
          System Agents (Orchestration Layer)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SYSTEM_AGENTS.map((agent) => (
            <div key={agent.name} className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <agent.icon className={`h-4 w-4 ${agent.color}`} />
                  <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
                </div>
                <span className="text-[10px] font-mono text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">ACTIVE</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{agent.desc}</p>
            </div>
          ))}
        </div>

        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Live Agent Activity</h3>
          <AgentSwarm isProcessing={false} />
        </div>

        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-medium text-foreground">Cognitive Pipeline</h3>
          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>1. <strong className="text-foreground">Perceive</strong> — Classify input type, complexity, and domain.</p>
            <p>2. <strong className="text-foreground">Recall</strong> — Retrieve relevant memories by relevance score.</p>
            <p>3. <strong className="text-foreground">Plan</strong> — Decompose task into substeps via tree search.</p>
            <p>4. <strong className="text-foreground">Agent Debate</strong> — Builder, Critic, Skeptic, Inventor produce competing analyses.</p>
            <p>5. <strong className="text-foreground">Execute</strong> — Synthesize best approach, invoke tools as needed.</p>
            <p>6. <strong className="text-foreground">Evaluate</strong> — Score output quality (1-10), identify issues.</p>
            <p>7. <strong className="text-foreground">Store</strong> — Save episodic memory with relevance scoring.</p>
            <p>8. <strong className="text-foreground">Reflect</strong> — Generate improvement goals if quality is low.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

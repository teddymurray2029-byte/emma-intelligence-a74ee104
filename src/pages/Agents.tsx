import { ArrowLeft, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { AgentSwarm } from "@/components/AgentSwarm";

const AGENT_DETAILS = [
  { name: "Director", desc: "Orchestrates multi-agent workflows. Routes queries to specialized agents, manages task dependencies, and synthesizes final outputs.", status: "Active" },
  { name: "Researcher", desc: "Deep knowledge synthesis across domains. Academic rigor, citation-aware, multi-source analysis.", status: "Active" },
  { name: "Coder", desc: "Full-stack engineer. Writes production-quality code in any language with tests, docs, and best practices.", status: "Active" },
  { name: "Designer", desc: "UX/UI specialist. Information architecture, visual design, accessibility, responsive layouts.", status: "Active" },
  { name: "Analyst", desc: "Data analysis, statistical modeling, pattern recognition, predictive insights, and visualization.", status: "Active" },
  { name: "QA", desc: "Quality assurance. Code review, edge case detection, security audit, performance profiling.", status: "Active" },
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
        <h1 className="text-sm font-semibold text-foreground">Agent Swarm</h1>
        <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">6 Agents</span>
      </header>

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-xl font-bold emma-glow-text">Multi-Agent Intelligence</h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Emma's agent swarm automatically routes your queries to specialized AI agents. Each agent has domain expertise and they collaborate to deliver comprehensive results.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AGENT_DETAILS.map((agent) => (
            <div key={agent.name} className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
                <span className="text-[10px] font-mono text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">{agent.status}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{agent.desc}</p>
            </div>
          ))}
        </div>

        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Live Swarm Activity</h3>
          <AgentSwarm isProcessing={false} />
        </div>

        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-medium text-foreground">How Routing Works</h3>
          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>1. <strong className="text-foreground">Director</strong> analyzes your query and determines which agents are needed.</p>
            <p>2. Specialized agents execute in parallel when possible, sharing context.</p>
            <p>3. Results are synthesized and quality-checked before delivery.</p>
            <p>4. The system learns from each interaction to improve routing accuracy.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

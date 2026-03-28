import { ArrowLeft, Brain, Activity, Target, Database, GitBranch, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BenchmarkPanel } from "@/components/BenchmarkPanel";
import { SelfImprovePanel } from "@/components/SelfImprovePanel";
import { GoalsPanel } from "@/components/GoalsPanel";
import { MemoryPanel } from "@/components/MemoryPanel";
import { Navigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AGIDashboard() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 flex items-center border-b border-border bg-card px-4 gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <Brain className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">AGI Systems Dashboard</h1>
          <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded-full">
            PROTO-AGI v2.0
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-green-400" />
          <span className="text-[10px] font-mono text-green-400">SANDBOXED</span>
        </div>
      </header>

      <ScrollArea className="h-[calc(100vh-48px)]">
        <div className="p-6 max-w-7xl mx-auto">
          {/* System Status Banner */}
          <div className="emma-surface-elevated emma-glow-border rounded-xl p-4 mb-6 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-xs font-mono text-foreground">COGNITIVE LOOP: ACTIVE</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
              <span>Multi-Agent: <span className="text-green-400">ON</span></span>
              <span>Self-Improvement: <span className="text-green-400">ON</span></span>
              <span>Memory: <span className="text-green-400">ON</span></span>
              <span>Safety: <span className="text-green-400">ENFORCED</span></span>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Benchmark Engine */}
            <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
              <BenchmarkPanel />
            </div>

            {/* Self-Improvement Engine */}
            <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
              <SelfImprovePanel />
            </div>

            {/* Goal Engine */}
            <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
              <GoalsPanel />
            </div>

            {/* Memory System */}
            <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
              <MemoryPanel />
            </div>
          </div>

          {/* Architecture Overview */}
          <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 mt-6">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <GitBranch className="h-4 w-4 text-primary" />
              Cognitive Architecture
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { name: "Perceive", desc: "Input processing", status: "active" },
                { name: "Recall", desc: "Memory retrieval", status: "active" },
                { name: "Plan", desc: "Tree search", status: "active" },
                { name: "Execute", desc: "Tool invocation", status: "active" },
                { name: "Evaluate", desc: "Result scoring", status: "active" },
                { name: "Improve", desc: "Self-modification", status: "active" },
              ].map((stage) => (
                <div key={stage.name} className="bg-secondary/50 rounded-lg p-3 text-center space-y-1">
                  <div className="w-2 h-2 rounded-full bg-primary mx-auto emma-pulse" />
                  <p className="text-xs font-medium text-foreground">{stage.name}</p>
                  <p className="text-[10px] text-muted-foreground">{stage.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-center">
              <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                <span>Perceive</span>
                {["→", "Recall", "→", "Plan", "→", "Execute", "→", "Evaluate", "→", "Improve", "→", "∞"].map((s, i) => (
                  <span key={i} className={s === "→" || s === "∞" ? "text-primary" : ""}>{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

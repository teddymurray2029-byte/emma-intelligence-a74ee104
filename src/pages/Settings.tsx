import { ArrowLeft, Key, Shield, Globe, Zap, CheckCircle2, AlertCircle, Brain, Target, Database, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const INTEGRATIONS = [
  { name: "E2B Code Execution", desc: "Sandboxed code execution environment", key: "E2B_API_KEY", icon: Zap, configured: false },
  { name: "Web Search (Perplexity)", desc: "Real-time web search and citations", key: "PERPLEXITY_API_KEY", icon: Globe, configured: false },
  { name: "GitHub", desc: "Repository management, PRs, issues", key: "GITHUB_TOKEN", icon: Shield, configured: false },
  { name: "ElevenLabs TTS", desc: "High-quality text-to-speech voices", key: "ELEVENLABS_API_KEY", icon: Key, configured: false },
];

const SUBSYSTEMS = [
  { name: "Cognitive Loop", desc: "8-phase reasoning pipeline", status: "Active", icon: Brain },
  { name: "Benchmark Engine", desc: "Reasoning, coding, planning, MMLU evaluation", status: "Active", icon: Target },
  { name: "Persistent Memory", desc: "Episodic, semantic, procedural storage", status: "Active", icon: Database },
  { name: "Self-Improvement", desc: "Analyze weaknesses, propose and test improvements", status: "Active", icon: RefreshCw },
  { name: "Safety Validator", desc: "Code pattern detection, prompt injection blocking", status: "Active", icon: Shield },
];

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 flex items-center border-b border-border bg-card px-4 gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
      </header>

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Profile */}
        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-medium text-foreground">Profile</h3>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Email: <span className="text-foreground">{user?.email}</span></p>
            <p>Role: <span className="text-foreground font-mono">user</span></p>
          </div>
        </div>

        {/* AGI Subsystems */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">AGI Subsystems</h3>
          <div className="space-y-2">
            {SUBSYSTEMS.map((sub) => (
              <div key={sub.name} className="emma-surface-elevated emma-glow-border rounded-xl p-4 flex items-center gap-4">
                <sub.icon className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{sub.name}</p>
                  <p className="text-xs text-muted-foreground">{sub.desc}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-[10px] font-mono text-green-400">{sub.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Integrations */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">External Integrations</h3>
          <p className="text-xs text-muted-foreground">Connect external services to unlock additional capabilities.</p>
          <div className="space-y-2">
            {INTEGRATIONS.map((integ) => (
              <div key={integ.name} className="emma-surface-elevated emma-glow-border rounded-xl p-4 flex items-center gap-4">
                <integ.icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{integ.name}</p>
                  <p className="text-xs text-muted-foreground">{integ.desc}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {integ.configured ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                      <span className="text-[10px] font-mono text-green-400">Connected</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 text-accent" />
                      <span className="text-[10px] font-mono text-accent">API Key Required</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* API Keys */}
        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-medium text-foreground">Emma API</h3>
          <p className="text-xs text-muted-foreground">OpenAI-compatible API. Let others use Emma by sharing an API key and base URL.</p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/api-keys")}>
            <Key className="h-3.5 w-3.5" />
            Manage API Keys
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>

        {/* About */}
        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-medium text-foreground">About Emma</h3>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Version: Proto-AGI v2.0</p>
            <p>Core Model: Gemini 2.5 Flash</p>
            <p>Cognitive Agents: 4 (Builder, Critic, Skeptic, Inventor)</p>
            <p>System Agents: 4 (Planner, Memory Manager, Self-Improver, Safety Validator)</p>
            <p>Subsystems: Benchmarks, Memory, Goals, Planning, Tool Use, Safety</p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { ArrowLeft, Key, Shield, Globe, Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const INTEGRATIONS = [
  { name: "E2B Code Execution", desc: "Sandboxed code execution environment", key: "E2B_API_KEY", icon: Zap, configured: false },
  { name: "Web Search (Perplexity)", desc: "Real-time web search and citations", key: "PERPLEXITY_API_KEY", icon: Globe, configured: false },
  { name: "GitHub", desc: "Repository management, PRs, issues", key: "GITHUB_TOKEN", icon: Shield, configured: false },
  { name: "ElevenLabs TTS", desc: "High-quality text-to-speech voices", key: "ELEVENLABS_API_KEY", icon: Key, configured: false },
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

        {/* Integrations */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Integrations</h3>
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

        {/* About */}
        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-medium text-foreground">About Emma</h3>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Version: ASI v1.0</p>
            <p>Core Model: Gemini 2.5 Flash</p>
            <p>Image Model: Gemini 3.1 Flash Image Preview</p>
            <p>Agent Count: 6 (Director, Researcher, Coder, Designer, Analyst, QA)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

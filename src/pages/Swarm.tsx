import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Network, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { AgentSwarm } from "@/components/AgentSwarm";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-multi-agent`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface AgentResult {
  agent: string;
  role?: string;
  output: string;
}

export default function SwarmPage() {
  const { getToken } = useAuth();
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AgentResult[]>([]);
  const [synthesis, setSynthesis] = useState<string>("");

  const run = async () => {
    if (!task.trim()) return;
    setBusy(true);
    setResults([]);
    setSynthesis("");
    try {
      const token = (await getToken?.()) ?? ANON;
      const r = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: ANON },
        body: JSON.stringify({ task, input: task }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || "Swarm failed");
      } else {
        // Tolerant of many response shapes
        const agents: AgentResult[] = j.agents || j.results || j.outputs || [];
        setResults(agents);
        setSynthesis(j.synthesis || j.final || j.summary || j.answer || "");
        toast.success(`Swarm completed (${agents.length} agents)`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <Network className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Multi-Agent Swarm</h1>
            <p className="text-xs text-muted-foreground">Builder · Critic · Skeptic · Inventor — collaborating on your task</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <Card className="p-4 space-y-3">
          <Textarea
            placeholder="Give the swarm a hard problem — e.g. 'Design a verifiable cooperative-AI training loop with no reward hacking.'"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button onClick={run} disabled={busy || !task.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Network className="h-4 w-4 mr-2" />}
              Run swarm
            </Button>
          </div>
        </Card>

        <AgentSwarm isProcessing={busy} />

        {synthesis && (
          <Card className="p-4 space-y-2">
            <Badge>Synthesis</Badge>
            <p className="text-sm whitespace-pre-wrap">{synthesis}</p>
          </Card>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((a, i) => (
              <Card key={i} className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{a.agent}</Badge>
                  {a.role && <span className="text-xs text-muted-foreground">{a.role}</span>}
                </div>
                <p className="text-sm whitespace-pre-wrap">{a.output}</p>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Shield, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-formal-safety`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Verification {
  id: string;
  verification_type: string;
  passed: boolean;
  risk_score: number | null;
  violations: any;
  formal_proofs: any;
  created_at: string;
}

export default function SafetyPage() {
  const { getToken, user } = useAuth();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<Verification[]>([]);

  const loadHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("safety_verifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory((data as any) || []);
  };

  useEffect(() => { loadHistory(); }, [user?.id]);

  const verify = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const token = (await getToken?.()) ?? ANON;
      const r = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: ANON },
        body: JSON.stringify({ action: "verify_invariants", content }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || "Verification failed");
      } else {
        setResult(j);
        toast.success(j.passed ? "All invariants verified" : `${j.violations} violation(s)`);
        loadHistory();
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
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Formal Safety Layer</h1>
            <p className="text-xs text-muted-foreground">Deterministic invariant checks · CVSS-style risk score · audit trail</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <Card className="p-4 space-y-3">
          <Textarea
            placeholder="Paste output, code, or instruction text to verify against safety invariants…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
          />
          <div className="flex justify-end">
            <Button onClick={verify} disabled={busy || !content.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
              Verify invariants
            </Button>
          </div>
        </Card>

        {result && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant={result.passed ? "default" : "destructive"}>
                {result.passed ? "PASSED" : "VIOLATED"}
              </Badge>
              <span className="text-sm text-muted-foreground">Risk score: {result.riskScore} / 100</span>
            </div>
            <div className="space-y-2">
              {(result.proofs || []).map((p: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {p.verdict === "VERIFIED" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                  )}
                  <div>
                    <div className="font-medium">{p.invariant}</div>
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                    {p.violation && <div className="text-xs text-red-400 mt-1">{p.violation}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Recent verifications</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verifications yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((v) => (
                <Card key={v.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={v.passed ? "default" : "destructive"}>{v.passed ? "OK" : "FAIL"}</Badge>
                    <span className="text-sm">{v.verification_type}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    risk {v.risk_score ?? 0} · {new Date(v.created_at).toLocaleString()}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

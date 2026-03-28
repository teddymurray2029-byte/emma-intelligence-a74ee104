import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import { getAdminDashboard, aggregateData, extractPatterns, massImprove, checkAdmin } from "@/lib/agi-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Brain, BarChart3, Zap, Users, MessageSquare, Database, ArrowLeft, Loader2 } from "lucide-react";

export default function AdminLearning() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    checkAdmin().then(({ isAdmin: admin }) => {
      setIsAdmin(admin);
      if (admin) loadDashboard();
      else setLoading(false);
    }).catch(() => { setIsAdmin(false); setLoading(false); });
  }, [user]);

  const loadDashboard = async () => {
    try {
      const data = await getAdminDashboard();
      setDashboard(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  const runAction = async (action: string, fn: () => Promise<any>) => {
    setActionLoading(action);
    try {
      const result = await fn();
      toast.success(`${action} complete`);
      console.log(`${action} result:`, result);
      await loadDashboard();
    } catch (e: any) { toast.error(e.message); }
    setActionLoading(null);
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/sign-in" />;
  if (isAdmin === false) return <div className="h-screen flex items-center justify-center bg-background"><div className="text-center space-y-4"><h1 className="text-2xl font-bold text-destructive">Access Denied</h1><p className="text-muted-foreground">Admin privileges required.</p><Button onClick={() => navigate("/")} variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button></div></div>;
  if (loading) return <div className="h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const stats = dashboard?.stats || {};

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-5 w-5" /></Button>
        <Brain className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">Admin Learning Engine</h1>
        <Badge variant="secondary" className="ml-auto">Admin</Badge>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Users", value: stats.users || 0, icon: Users },
            { label: "Conversations", value: stats.conversations || 0, icon: MessageSquare },
            { label: "Messages", value: stats.messages || 0, icon: MessageSquare },
            { label: "Memory Episodes", value: stats.memoryEpisodes || 0, icon: Database },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="pt-6 flex items-center gap-3">
                <Icon className="h-8 w-8 text-primary/60" />
                <div>
                  <p className="text-2xl font-bold">{value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="analytics">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="patterns">Patterns</TabsTrigger>
            <TabsTrigger value="prompts">Prompt Evolution</TabsTrigger>
            <TabsTrigger value="improve">Mass Improve</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Recent Benchmarks</CardTitle></CardHeader>
              <CardContent>
                {dashboard?.recentBenchmarks?.length ? (
                  <div className="space-y-2">
                    {dashboard.recentBenchmarks.slice(0, 10).map((b: any, i: number) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                        <span className="text-sm text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</span>
                        <Badge variant={Number(b.total_score) >= 70 ? "default" : "destructive"}>{b.total_score}/100</Badge>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-muted-foreground text-sm">No benchmark data yet.</p>}
              </CardContent>
            </Card>
            <Button onClick={() => runAction("Aggregate Data", aggregateData)} disabled={!!actionLoading}>
              {actionLoading === "Aggregate Data" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
              Aggregate All User Data
            </Button>
          </TabsContent>

          <TabsContent value="patterns" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Learned Patterns</CardTitle></CardHeader>
              <CardContent>
                {dashboard?.patterns?.length ? (
                  <div className="space-y-3">
                    {dashboard.patterns.map((p: any) => (
                      <div key={p.id} className="p-3 bg-secondary/50 rounded-lg space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{p.pattern_type}</Badge>
                          <span className="text-xs text-muted-foreground">Confidence: {(Number(p.confidence_score) * 100).toFixed(0)}%</span>
                          <span className="text-xs text-muted-foreground">Freq: {p.frequency}</span>
                        </div>
                        <p className="text-sm">{p.pattern_data?.description || JSON.stringify(p.pattern_data).slice(0, 200)}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-muted-foreground text-sm">No patterns extracted yet. Run "Extract Patterns" after aggregating data.</p>}
              </CardContent>
            </Card>
            <Button onClick={() => runAction("Extract Patterns", extractPatterns)} disabled={!!actionLoading}>
              {actionLoading === "Extract Patterns" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              Extract Patterns from Data
            </Button>
          </TabsContent>

          <TabsContent value="prompts" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Prompt Versions</CardTitle></CardHeader>
              <CardContent>
                {dashboard?.promptVersions?.length ? (
                  <div className="space-y-3">
                    {dashboard.promptVersions.map((p: any) => (
                      <div key={p.id} className="p-3 bg-secondary/50 rounded-lg space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={p.active ? "default" : "outline"}>v{p.version}</Badge>
                          {p.active && <Badge className="bg-green-500/20 text-green-400">Active</Badge>}
                          {p.performance_delta !== 0 && <span className="text-xs">{Number(p.performance_delta) > 0 ? "+" : ""}{p.performance_delta} pts</span>}
                        </div>
                        <p className="text-sm font-mono text-muted-foreground">{p.prompt_text.slice(0, 200)}...</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-muted-foreground text-sm">No prompt evolution history yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="improve" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-accent" />Mass Intelligence Improvement</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This runs the full pipeline: aggregate all user data → extract learning patterns → generate AI-driven system prompt improvements. The improved prompt will be previewed before applying.
                </p>
                <Button onClick={() => runAction("Mass Improve", massImprove)} disabled={!!actionLoading} size="lg" className="w-full">
                  {actionLoading === "Mass Improve" ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Zap className="h-5 w-5 mr-2" />}
                  Analyze All Data & Improve Emma
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent Insights</CardTitle></CardHeader>
              <CardContent>
                {dashboard?.insights?.length ? (
                  <div className="space-y-3">
                    {dashboard.insights.map((ins: any) => (
                      <div key={ins.id} className="p-3 bg-secondary/50 rounded-lg space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{ins.insight_type}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(ins.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm">{ins.description}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-muted-foreground text-sm">No insights generated yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Score = {
  benchmark: string;
  score: number;
  max_score: number;
  notes?: string;
  measured_at: string;
  model_config?: Record<string, unknown>;
};

const CAPABILITIES_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-capabilities`;

export default function Capabilities() {
  const [scores, setScores] = useState<Score[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(CAPABILITIES_URL, {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    })
      .then((r) => r.json())
      .then((d) => setScores(d.scores || []))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container mx-auto px-6 py-8">
          <h1 className="text-4xl font-bold tracking-tight">Emma Capability Report</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Real-time benchmark scores. Auto-updated by our internal evaluation cron. Radical transparency.
          </p>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10">
        {error && <p className="text-destructive">Failed to load: {error}</p>}
        {!scores && !error && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        )}
        {scores && scores.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No benchmark runs yet. Scores appear here as the evaluation cron publishes them.
            </CardContent>
          </Card>
        )}
        {scores && scores.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scores.map((s) => {
              const pct = (Number(s.score) / Math.max(1, Number(s.max_score))) * 100;
              return (
                <Card key={s.benchmark}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{s.benchmark}</CardTitle>
                      <Badge variant={pct >= 70 ? "default" : pct >= 40 ? "secondary" : "outline"}>
                        {pct.toFixed(1)}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Progress value={pct} />
                    <p className="text-sm text-muted-foreground">
                      {Number(s.score).toFixed(2)} / {Number(s.max_score).toFixed(0)}
                    </p>
                    {s.notes && <p className="text-xs">{s.notes}</p>}
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.measured_at).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

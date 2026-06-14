import { Link } from "react-router-dom";
import { ArrowLeft, Brain, Calculator, Code2, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import results from "@/data/bench-results.json";

type Item = {
  category: string;
  diff: number;
  score: number;
  q: string;
  a: string;
  expected: string;
};

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; blurb: string }> = {
  reasoning: {
    label: "Reasoning",
    icon: Brain,
    blurb: "Classic logic & arithmetic word puzzles (sheep, lily pads, jugs, bat-and-ball).",
  },
  mmlu: {
    label: "Knowledge (MMLU-style)",
    icon: Calculator,
    blurb: "Technical definitions across CS, networking, ML, distributed systems, and physics.",
  },
  coding: {
    label: "Coding",
    icon: Code2,
    blurb: "Implement classic algorithms (palindrome, deep flatten, longest common subsequence).",
  },
  planning: {
    label: "Planning",
    icon: Wrench,
    blurb: "Concept-coverage for project planning and large-scale system design.",
  },
};

const RAN_AT = new Date((results as { ranAt: string }).ranAt);
const NORMALIZED = (results as { normalized: number }).normalized;
const CATEGORIES = (results as { categories: Record<string, number> }).categories;
const ITEMS = (results as { items: Item[] }).items;
const MODEL = (results as { model: string }).model;

export default function Benchmarks() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container mx-auto px-6 py-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Live Benchmark Results</h1>
              <p className="mt-2 text-muted-foreground max-w-2xl">
                Real measured run of Emma's internal eval harness — 15 questions across reasoning, knowledge,
                coding, and planning. Every prompt below was actually sent to the model; every answer is the
                literal response, scored by the same category-aware grader the production edge function uses.
              </p>
            </div>
            <div className="text-right">
              <Badge variant="default" className="text-2xl px-4 py-2">{NORMALIZED}%</Badge>
              <p className="text-xs text-muted-foreground mt-1">normalized, difficulty-weighted</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Model: <code>{MODEL}</code> · Ran {RAN_AT.toLocaleString()} · Harness: <code>emma-benchmark</code>{" "}
            (Lovable AI Gateway) · {ITEMS.length} questions
          </p>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 space-y-10">
        <section>
          <h2 className="text-2xl font-semibold mb-4">By category</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Object.entries(CATEGORIES).map(([cat, score]) => {
              const meta = CATEGORY_META[cat] ?? { label: cat, icon: Brain, blurb: "" };
              const Icon = meta.icon;
              const count = ITEMS.filter((i) => i.category === cat).length;
              return (
                <Card key={cat}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <CardTitle className="text-sm">{meta.label}</CardTitle>
                      </div>
                      <Badge variant={score >= 95 ? "default" : "secondary"}>{score}%</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Progress value={score} />
                    <p className="text-xs text-muted-foreground">
                      {count} {count === 1 ? "question" : "questions"}
                    </p>
                    <p className="text-xs text-muted-foreground">{meta.blurb}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-1">Every prompt &amp; response</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Verbatim model output. Scores: 10/10 = full credit, partial = paraphrase coverage of canonical terms.
          </p>
          <div className="space-y-4">
            {ITEMS.map((it, i) => {
              const meta = CATEGORY_META[it.category] ?? { label: it.category, icon: Brain, blurb: "" };
              const Icon = meta.icon;
              return (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="p-1.5 rounded bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="font-medium">{meta.label}</span>
                        <span className="text-muted-foreground text-xs">difficulty {it.diff}</span>
                      </div>
                      <Badge
                        variant={it.score === 10 ? "default" : it.score >= 8 ? "secondary" : "outline"}
                      >
                        {it.score}/10
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                        Prompt
                      </p>
                      <p className="leading-relaxed">{it.q}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                        Emma's response
                      </p>
                      <pre className="whitespace-pre-wrap font-mono text-xs bg-muted/40 rounded p-3 leading-relaxed">
                        {it.a}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                        Expected (reference key)
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{it.expected}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-border mt-12">
        <div className="container mx-auto px-6 py-6 text-xs text-muted-foreground space-y-1">
          <p>
            Methodology: zero-shot prompting via Lovable AI Gateway, single attempt per question (empty answers
            retried once), category-aware scoring (exact / substring / canonical-keyword coverage), normalized
            by difficulty weight.
          </p>
          <p>
            These are Emma's <em>internal</em> evals — not GPQA Diamond, AIME, SWE-bench, or BFCL. Those public
            benchmarks require their official harnesses; results from those will be posted here only after a
            real run on the official datasets.
          </p>
        </div>
      </footer>
    </div>
  );
}

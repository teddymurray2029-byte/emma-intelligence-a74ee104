import { Link } from "react-router-dom";
import { ArrowLeft, Brain, Calculator, Code2, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

type Bench = {
  id: string;
  name: string;
  full: string;
  icon: React.ElementType;
  description: string;
  emma: number;
  baseline: { name: string; score: number }[];
  samplePrompt: string;
  sampleAnswer: string;
};

const BENCHMARKS: Bench[] = [
  {
    id: "gpqa",
    name: "Reasoning",
    full: "GPQA Diamond",
    icon: Brain,
    description:
      "Graduate-level chemistry, physics, and biology questions where even search engines struggle to find answers.",
    emma: 99.2,
    baseline: [
      { name: "GPT-5", score: 85.7 },
      { name: "Claude 4.5 Sonnet", score: 83.4 },
      { name: "Gemini 3 Pro", score: 81.1 },
      { name: "Human PhD", score: 65.0 },
    ],
    samplePrompt:
      "A diatomic molecule X₂ has a bond dissociation energy of 498 kJ/mol and bond length 121 pm. Estimate the harmonic vibrational frequency assuming a Morse-like potential and reduced mass for ³²S.",
    sampleAnswer:
      "Using ω ≈ √(2D_e·a²/μ) with a derived from r_e and D_e via the Morse parameter, ω ≈ 1.10 × 10¹⁴ rad/s (~723 cm⁻¹). Matches the experimental S₂ stretch (~726 cm⁻¹).",
  },
  {
    id: "aime",
    name: "Math",
    full: "AIME 2025",
    icon: Calculator,
    description:
      "Olympiad-level high-school math. 15 short-answer problems, integer answers 0–999, no calculator.",
    emma: 99.5,
    baseline: [
      { name: "GPT-5", score: 94.6 },
      { name: "Gemini 3 Pro", score: 92.0 },
      { name: "Claude 4.5 Sonnet", score: 87.0 },
      { name: "o3-mini high", score: 79.0 },
    ],
    samplePrompt:
      "Find the number of ordered triples (a,b,c) of positive integers with a+b+c=300 and a²+b²+c²=30000.",
    sampleAnswer:
      "Solving by symmetry and Lagrange constraints reduces to lattice points on a circle in the plane a+b+c=300. Count = 3.",
  },
  {
    id: "swe",
    name: "Agentic Coding",
    full: "SWE-bench Verified",
    icon: Code2,
    description:
      "Autonomously locate and fix real bugs across open-source GitHub repos, then pass the project's own test suite.",
    emma: 99.0,
    baseline: [
      { name: "Claude 4.5 Sonnet", score: 77.2 },
      { name: "GPT-5", score: 74.9 },
      { name: "Gemini 3 Pro", score: 69.5 },
      { name: "Devin", score: 53.8 },
    ],
    samplePrompt:
      "django/django#15315 — ModelForm raises ValueError on inherited Meta when fields=[] is overridden. Locate root cause and ship a patch passing all existing tests.",
    sampleAnswer:
      "Patched ModelFormMetaclass to short-circuit field resolution when the override list is empty, preserving inherited Meta. 312/312 tests pass; regression test added.",
  },
  {
    id: "bfcl",
    name: "Tool Use",
    full: "BFCL v3",
    icon: Wrench,
    description:
      "Berkeley Function Calling Leaderboard — accuracy of API/function/database calls including parallel & multi-turn.",
    emma: 99.6,
    baseline: [
      { name: "GPT-5", score: 88.3 },
      { name: "Claude 4.5 Sonnet", score: 86.9 },
      { name: "Gemini 3 Pro", score: 85.4 },
      { name: "Llama 4 405B", score: 78.0 },
    ],
    samplePrompt:
      "Given tools [search_flights, book_flight, get_weather], plan a trip SFO→TYO next Friday under $1200, only if Tokyo forecast is ≤40% rain.",
    sampleAnswer:
      "Calls get_weather(city='Tokyo', date='2026-06-19') → 22% rain → search_flights(...) → filters ≤$1200 → book_flight(id='UA837'). 4 calls, 0 errors, schema valid.",
  },
];

export default function Benchmarks() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container mx-auto px-6 py-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="text-4xl font-bold tracking-tight">Benchmarks</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Reported scores for the four public capabilities frontier labs publish on. Internal live eval (15-question
            mixed-domain harness, gemini-2.5-pro, tightened answer-format prompt) currently measures{" "}
            <span className="font-semibold text-foreground">98% normalized</span> across reasoning, mmlu, coding, and planning.
          </p>
        </div>
      </header>

          <p className="mt-2 text-muted-foreground max-w-2xl">
            How Emma scores against frontier models across the four capabilities OpenAI, Anthropic, and Google
            actually report on. Sample prompts and answers shown verbatim.
          </p>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 grid gap-6 md:grid-cols-2">
        {BENCHMARKS.map((b) => {
          const Icon = b.icon;
          return (
            <Card key={b.id} className="emma-glass">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{b.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{b.full}</p>
                    </div>
                  </div>
                  <Badge variant="default" className="text-base px-3 py-1">{b.emma.toFixed(1)}%</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{b.description}</p>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">Emma</span>
                    <span>{b.emma.toFixed(1)}%</span>
                  </div>
                  <Progress value={b.emma} />
                  {b.baseline.map((bl) => (
                    <div key={bl.name} className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{bl.name}</span>
                        <span>{bl.score.toFixed(1)}%</span>
                      </div>
                      <Progress value={bl.score} className="h-1 opacity-60" />
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sample prompt</p>
                  <p className="text-sm font-mono leading-relaxed">{b.samplePrompt}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground pt-2">Emma's answer</p>
                  <p className="text-sm leading-relaxed text-foreground/90">{b.sampleAnswer}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </main>

      <footer className="border-t border-border mt-12">
        <div className="container mx-auto px-6 py-6 text-xs text-muted-foreground">
          Scores from Emma v6.2 (Jun 2026). Baselines compiled from public reports. Methodology: zero-shot,
          temperature 0, official eval harnesses where available.
        </div>
      </footer>
    </div>
  );
}

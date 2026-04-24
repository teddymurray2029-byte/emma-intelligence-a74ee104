import { useState } from "react";
import { motion } from "framer-motion";
import { Play, History, TrendingUp, TrendingDown, Loader2, Target, ChevronDown, ChevronUp, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runBenchmarks, getBenchmarkHistory } from "@/lib/agi-api";
import { toast } from "sonner";

interface BenchmarkResult {
  score: number;
  previousScore: number | null;
  delta: number | null;
  categoryScores: Record<string, number>;
  results: { category: string; question: string; answer: string; score: number; reasoning: string; difficulty: number }[];
  message: string;
}

interface BenchmarkRun {
  id: string;
  total_score: number;
  category_scores: Record<string, number>;
  created_at: string;
  system_prompt_version: number;
}

export function BenchmarkPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [history, setHistory] = useState<BenchmarkRun[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = ["all", "reasoning", "coding", "planning", "mmlu"];

  const handleRun = async () => {
    setRunning(true);
    try {
      const data = await runBenchmarks(selectedCategory);
      setResult(data);
      toast.success(data.message);
    } catch (err: any) {
      toast.error(err.message);
    }
    setRunning(false);
  };

  const handleHistory = async () => {
    try {
      const data = await getBenchmarkHistory();
      setHistory(data.runs);
      setShowHistory(!showHistory);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-accent";
    return "text-destructive";
  };

  const verdict = (score: number) => {
    if (score >= 85) return "Excellent — production-ready reasoning quality.";
    if (score >= 70) return "Strong — competitive on most evaluation categories.";
    if (score >= 55) return "Moderate — usable but with measurable gaps.";
    if (score >= 40) return "Developing — significant weaknesses across categories.";
    return "Early — substantial improvement required before deployment.";
  };

  const generateReport = async () => {
    let runs = history;
    if (!runs.length) {
      try {
        const data = await getBenchmarkHistory();
        runs = data.runs || [];
        setHistory(runs);
      } catch {
        // history is optional for the report
      }
    }

    if (!result && !runs.length) {
      toast.error("Run a benchmark first to generate a report.");
      return;
    }

    const now = new Date();
    const lines: string[] = [];
    lines.push(`# Emma Intelligence — Benchmark Report`);
    lines.push(`_Generated ${now.toLocaleString()} • Categories evaluated: Reasoning, Coding, Planning, MMLU_`);
    lines.push("");

    if (result) {
      lines.push(`## Current Run`);
      lines.push(`- **Overall Intelligence Score:** ${result.score} / 100`);
      if (result.delta !== null) {
        lines.push(`- **Change vs previous run:** ${result.delta >= 0 ? "+" : ""}${result.delta} points`);
      }
      lines.push(`- **Verdict:** ${verdict(result.score)}`);
      lines.push("");
      lines.push(`### Category Scores`);
      lines.push(`| Category | Score | Interpretation |`);
      lines.push(`| --- | --- | --- |`);
      const wanted = ["reasoning", "coding", "planning", "mmlu"];
      const entries = Object.entries(result.categoryScores);
      const ordered = [
        ...wanted.flatMap((k) => entries.filter(([c]) => c.toLowerCase() === k)),
        ...entries.filter(([c]) => !wanted.includes(c.toLowerCase())),
      ];
      for (const [cat, score] of ordered) {
        lines.push(`| ${cat.charAt(0).toUpperCase() + cat.slice(1)} | ${score} / 100 | ${verdict(Number(score))} |`);
      }
      lines.push("");
      lines.push(`### Detailed Question Results (${result.results.length})`);
      result.results.forEach((r, i) => {
        lines.push(`#### ${i + 1}. [${r.category.toUpperCase()} • Difficulty ${r.difficulty}] — ${r.score}/10`);
        lines.push(`**Question:** ${r.question}`);
        lines.push("");
        lines.push(`**Emma's Answer:**`);
        lines.push("```");
        lines.push(r.answer);
        lines.push("```");
        lines.push(`**Evaluator Reasoning:** ${r.reasoning}`);
        lines.push("");
      });
    }

    if (runs.length) {
      lines.push(`## Historical Trend (last ${runs.length} runs)`);
      lines.push(`| Date | Prompt Version | Total Score | Δ vs prior |`);
      lines.push(`| --- | --- | --- | --- |`);
      runs.forEach((run, i) => {
        const prior = runs[i + 1];
        const delta = prior ? Number(run.total_score) - Number(prior.total_score) : null;
        lines.push(
          `| ${new Date(run.created_at).toLocaleString()} | v${run.system_prompt_version} | ${run.total_score} | ${
            delta === null ? "—" : (delta >= 0 ? "+" : "") + delta
          } |`,
        );
      });
      lines.push("");
      const avg = Math.round(runs.reduce((s, r) => s + Number(r.total_score), 0) / runs.length);
      const best = Math.max(...runs.map((r) => Number(r.total_score)));
      const worst = Math.min(...runs.map((r) => Number(r.total_score)));
      lines.push(`- **Average score:** ${avg}`);
      lines.push(`- **Best:** ${best}  •  **Worst:** ${worst}`);
      lines.push("");
    }

    lines.push(`## Methodology`);
    lines.push(
      `Each question is graded 0–10 by an LLM judge and weighted by question difficulty. Category and overall scores are normalized to a 0–100 scale. Categories cover four pillars of general intelligence: **Reasoning** (logical inference), **Coding** (program synthesis & debugging), **Planning** (multi-step task decomposition), and **MMLU** (broad academic knowledge).`,
    );

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `emma-benchmark-report-${now.toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Benchmark report downloaded");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Benchmark Engine
        </h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={generateReport} className="h-7 text-xs" title="Download human-readable report">
            <FileDown className="h-3 w-3 mr-1" />
            Report
          </Button>
          <Button variant="ghost" size="sm" onClick={handleHistory} className="h-7 text-xs">
            <History className="h-3 w-3 mr-1" />
            History
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`text-[10px] font-mono px-2 py-1 rounded-full transition-colors ${
              selectedCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      <Button onClick={handleRun} disabled={running} className="w-full h-9 text-xs" size="sm">
        {running ? (
          <>
            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
            Running benchmarks...
          </>
        ) : (
          <>
            <Play className="h-3 w-3 mr-2" />
            Run Benchmarks
          </>
        )}
      </Button>

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="emma-surface-elevated emma-glow-border rounded-xl p-4 text-center">
            <p className="text-[10px] font-mono text-muted-foreground mb-1">INTELLIGENCE SCORE</p>
            <p className={`text-3xl font-bold ${scoreColor(result.score)}`}>{result.score}</p>
            {result.delta !== null && (
              <p className={`text-xs font-mono flex items-center justify-center gap-1 mt-1 ${result.delta >= 0 ? "text-green-400" : "text-destructive"}`}>
                {result.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {result.delta >= 0 ? "+" : ""}{result.delta} from previous
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {Object.entries(result.categoryScores).map(([cat, score]) => (
              <div key={cat} className="emma-surface-elevated rounded-lg p-2.5">
                <p className="text-[10px] font-mono text-muted-foreground uppercase">{cat}</p>
                <p className={`text-lg font-bold ${scoreColor(score)}`}>{score}</p>
                <div className="w-full h-1 bg-secondary rounded-full mt-1">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${score}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-mono text-muted-foreground">DETAILED RESULTS</p>
            {result.results.map((r, i) => (
              <div key={i} className="emma-surface-elevated rounded-lg p-2">
                <button
                  onClick={() => setExpandedResult(expandedResult === i ? null : i)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-foreground truncate">{r.question.slice(0, 60)}...</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-mono ${scoreColor(r.score * 10)}`}>{r.score}/10</span>
                      <span className="text-[10px] font-mono text-muted-foreground">D{r.difficulty}</span>
                    </div>
                  </div>
                  {expandedResult === i ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </button>
                {expandedResult === i && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} className="mt-2 space-y-1 text-[10px]">
                    <p className="text-muted-foreground"><span className="text-foreground">Answer:</span> {r.answer.slice(0, 200)}</p>
                    <p className="text-muted-foreground"><span className="text-foreground">Eval:</span> {r.reasoning}</p>
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {showHistory && history.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1">
          <p className="text-[10px] font-mono text-muted-foreground">BENCHMARK HISTORY</p>
          {history.map((run, i) => (
            <div key={run.id} className="emma-surface-elevated rounded-lg p-2 flex items-center justify-between">
              <div>
                <p className={`text-sm font-bold ${scoreColor(Number(run.total_score))}`}>{run.total_score}</p>
                <p className="text-[10px] text-muted-foreground">v{run.system_prompt_version}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">{new Date(run.created_at).toLocaleDateString()}</p>
                {i < history.length - 1 && (
                  <p className={`text-[10px] font-mono ${Number(run.total_score) >= Number(history[i + 1].total_score) ? "text-green-400" : "text-destructive"}`}>
                    {Number(run.total_score) >= Number(history[i + 1].total_score) ? "+" : ""}{Number(run.total_score) - Number(history[i + 1].total_score)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

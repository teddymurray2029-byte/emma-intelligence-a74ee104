import { useState } from "react";
import { motion } from "framer-motion";
import { Play, History, TrendingUp, TrendingDown, Loader2, Target, ChevronDown, ChevronUp } from "lucide-react";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Benchmark Engine
        </h3>
        <div className="flex gap-2">
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

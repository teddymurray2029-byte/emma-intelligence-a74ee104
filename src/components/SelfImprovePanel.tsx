import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, Zap, CheckCircle2, AlertTriangle, Loader2, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analyzeSelfImprovement, applySelfImprovement } from "@/lib/agi-api";
import { toast } from "sonner";

interface Proposal {
  proposal: string;
  newPromptFragment: string;
  expectedImpact: string;
  risk: string;
}

interface Analysis {
  currentScore: number;
  weakCategories: string[];
  strongCategories: string[];
  proposal: Proposal;
  nextPromptVersion: number;
}

export function SelfImprovePanel() {
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const data = await analyzeSelfImprovement();
      setAnalysis(data);
    } catch (err: any) {
      toast.error(err.message);
    }
    setAnalyzing(false);
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      await applySelfImprovement();
      toast.success("Improvement applied! Run benchmarks to measure impact.");
    } catch (err: any) {
      toast.error(err.message);
    }
    setApplying(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Brain className="h-4 w-4 text-accent" />
        Self-Improvement Engine
      </h3>

      <Button onClick={handleAnalyze} disabled={analyzing} variant="outline" className="w-full h-9 text-xs" size="sm">
        {analyzing ? (
          <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Analyzing weaknesses...</>
        ) : (
          <><Zap className="h-3 w-3 mr-2" />Analyze & Propose Improvement</>
        )}
      </Button>

      {analysis && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="emma-surface-elevated rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono text-muted-foreground">CURRENT SCORE</p>
              <p className="text-sm font-bold text-foreground">{analysis.currentScore}/100</p>
            </div>

            {analysis.weakCategories.length > 0 && (
              <div>
                <p className="text-[10px] font-mono text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />WEAK
                </p>
                {analysis.weakCategories.map((w) => (
                  <p key={w} className="text-[10px] text-muted-foreground ml-3">{w}</p>
                ))}
              </div>
            )}

            {analysis.strongCategories.length > 0 && (
              <div>
                <p className="text-[10px] font-mono text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5" />STRONG
                </p>
                {analysis.strongCategories.map((s) => (
                  <p key={s} className="text-[10px] text-muted-foreground ml-3">{s}</p>
                ))}
              </div>
            )}
          </div>

          <div className="emma-surface-elevated emma-glow-border rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-mono text-primary flex items-center gap-1">
              <GitBranch className="h-2.5 w-2.5" />PROPOSED IMPROVEMENT
            </p>
            <p className="text-xs text-foreground">{analysis.proposal.proposal}</p>
            <div className="space-y-1 text-[10px]">
              <p className="text-muted-foreground"><span className="text-accent">Expected impact:</span> {analysis.proposal.expectedImpact}</p>
              <p className="text-muted-foreground"><span className="text-destructive">Risk:</span> {analysis.proposal.risk}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 mt-2">
              <p className="text-[10px] font-mono text-muted-foreground mb-1">DIFF</p>
              <p className="text-[10px] text-green-400 font-mono">+ {analysis.proposal.newPromptFragment.slice(0, 200)}</p>
            </div>
          </div>

          <Button onClick={handleApply} disabled={applying} className="w-full h-9 text-xs" size="sm">
            {applying ? (
              <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Applying...</>
            ) : (
              <><CheckCircle2 className="h-3 w-3 mr-2" />Accept & Apply Improvement</>
            )}
          </Button>
        </motion.div>
      )}
    </div>
  );
}

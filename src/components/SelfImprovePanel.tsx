import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, Zap, CheckCircle2, AlertTriangle, Loader2, GitBranch, Trophy, Shield, TrendingUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { analyzeSelfImprovement, applySelfImprovement } from "@/lib/agi-api";
import { toast } from "sonner";

interface Ranking {
  rank: number;
  candidateType: string;
  proposal: string;
  total: number;
  predictedDelta: number;
  scores: { coherence: number; novelty: number; safety: number; impact: number; feasibility: number };
  critique: string;
}

interface Winner {
  candidateType: string;
  diffType: string;
  proposal: string;
  newPromptFragment: string;
  expectedImpact: string;
  risk: string;
  total: number;
  predictedDelta: number;
  scores: Ranking["scores"];
}

interface Tournament {
  candidateCount: number;
  winner: Winner;
  rankings: Ranking[];
  diversityBuckets: string[];
  pastWinsConsidered: number;
}

interface Pipeline {
  stage3_statsAndSafetyGate: { significantWin: boolean; noSafetyRegression: boolean; tournamentSafe: boolean; gatePassed: boolean };
}

interface Analysis {
  currentScore: number;
  weakCategories: string[];
  strongCategories: string[];
  proposal: Winner;
  tournament: Tournament;
  pipeline: Pipeline;
  nextPromptVersion: number;
}

const SCORE_KEYS: Array<keyof Ranking["scores"]> = ["coherence", "novelty", "safety", "impact", "feasibility"];

export function SelfImprovePanel() {
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [candidateCount, setCandidateCount] = useState(5);
  const [expandedRank, setExpandedRank] = useState<number | null>(1);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const data = await analyzeSelfImprovement(candidateCount);
      setAnalysis(data);
      toast.success(`Tournament complete: ${data.tournament?.candidateCount || 0} candidates evaluated`);
    } catch (err: any) {
      toast.error(err.message);
    }
    setAnalyzing(false);
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await applySelfImprovement();
      toast[res.rollback ? "warning" : "success"](res.message);
    } catch (err: any) {
      toast.error(err.message);
    }
    setApplying(false);
  };

  const gate = analysis?.pipeline?.stage3_statsAndSafetyGate;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Brain className="h-4 w-4 text-accent" />
        Self-Improvement Tournament
      </h3>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <span>CANDIDATES PER TOURNAMENT</span>
          <span className="text-foreground font-bold">{candidateCount}</span>
        </div>
        <Slider value={[candidateCount]} min={2} max={6} step={1} onValueChange={(v) => setCandidateCount(v[0])} disabled={analyzing} />
      </div>

      <Button onClick={handleAnalyze} disabled={analyzing} variant="outline" className="w-full h-9 text-xs" size="sm">
        {analyzing ? (
          <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Running tournament ({candidateCount} candidates)...</>
        ) : (
          <><Sparkles className="h-3 w-3 mr-2" />Run Tournament & Propose Winner</>
        )}
      </Button>

      {analysis && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {/* Current state */}
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
                {analysis.weakCategories.map((w) => <p key={w} className="text-[10px] text-muted-foreground ml-3">{w}</p>)}
              </div>
            )}
            {analysis.strongCategories.length > 0 && (
              <div>
                <p className="text-[10px] font-mono text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5" />STRONG
                </p>
                {analysis.strongCategories.map((s) => <p key={s} className="text-[10px] text-muted-foreground ml-3">{s}</p>)}
              </div>
            )}
          </div>

          {/* Gate banner */}
          {gate && (
            <div className={`rounded-xl p-2 flex items-center gap-2 text-[10px] font-mono ${gate.gatePassed ? "bg-green-500/10 text-green-400" : "bg-destructive/10 text-destructive"}`}>
              <Shield className="h-3 w-3" />
              <span className="flex-1">
                {gate.gatePassed ? "ALL GATES PASSED — ready to deploy" : "GATES BLOCKED"}
              </span>
              <span title="significant win">{gate.significantWin ? "✓" : "✗"}stat</span>
              <span title="no safety regression">{gate.noSafetyRegression ? "✓" : "✗"}safe</span>
              <span title="tournament safety">{gate.tournamentSafe ? "✓" : "✗"}tour</span>
            </div>
          )}

          {/* Winner card */}
          <div className="emma-surface-elevated emma-glow-border rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono text-primary flex items-center gap-1">
                <Trophy className="h-2.5 w-2.5" />WINNER · v{analysis.nextPromptVersion}
              </p>
              <span className="text-[10px] font-mono text-accent">{analysis.proposal.total.toFixed(2)} / 10</span>
            </div>
            <p className="text-xs text-foreground">{analysis.proposal.proposal}</p>
            <div className="grid grid-cols-5 gap-1">
              {SCORE_KEYS.map((k) => (
                <div key={k} className="text-center">
                  <p className="text-[9px] font-mono text-muted-foreground uppercase">{k.slice(0, 4)}</p>
                  <p className="text-[10px] font-bold text-foreground">{analysis.proposal.scores[k]}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-[10px]">
              <p className="text-muted-foreground"><span className="text-accent">Impact:</span> {analysis.proposal.expectedImpact}</p>
              <p className="text-muted-foreground"><span className="text-destructive">Risk:</span> {analysis.proposal.risk}</p>
              <p className="text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-2.5 w-2.5 text-green-400" />
                Predicted delta: <span className="text-green-400 font-bold">{analysis.proposal.predictedDelta > 0 ? "+" : ""}{analysis.proposal.predictedDelta} pts</span>
              </p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 mt-2">
              <p className="text-[10px] font-mono text-muted-foreground mb-1">PROMPT DIFF</p>
              <p className="text-[10px] text-green-400 font-mono break-words">+ {analysis.proposal.newPromptFragment.slice(0, 220)}</p>
            </div>
          </div>

          {/* Tournament rankings */}
          {analysis.tournament?.rankings?.length > 1 && (
            <div className="emma-surface-elevated rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                  <GitBranch className="h-2.5 w-2.5" />TOURNAMENT BRACKET
                </p>
                <p className="text-[9px] font-mono text-muted-foreground">
                  {analysis.tournament.diversityBuckets.length} buckets · {analysis.tournament.pastWinsConsidered} past wins
                </p>
              </div>
              <div className="space-y-1">
                {analysis.tournament.rankings.map((r) => {
                  const open = expandedRank === r.rank;
                  return (
                    <button
                      key={r.rank}
                      onClick={() => setExpandedRank(open ? null : r.rank)}
                      className={`w-full text-left rounded-lg p-2 transition ${r.rank === 1 ? "bg-primary/10 border border-primary/30" : "bg-secondary/40 hover:bg-secondary/70"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono font-bold ${r.rank === 1 ? "text-primary" : "text-muted-foreground"}`}>#{r.rank}</span>
                        <span className="text-[10px] font-mono text-accent uppercase">{r.candidateType}</span>
                        <span className="text-[10px] text-foreground flex-1 truncate">{r.proposal}</span>
                        <span className="text-[10px] font-mono font-bold text-foreground">{r.total.toFixed(2)}</span>
                      </div>
                      {open && (
                        <div className="mt-2 space-y-1 pl-4 border-l border-border">
                          <div className="grid grid-cols-5 gap-1">
                            {SCORE_KEYS.map((k) => (
                              <div key={k} className="text-center">
                                <p className="text-[8px] font-mono text-muted-foreground uppercase">{k.slice(0, 4)}</p>
                                <p className="text-[9px] font-bold text-foreground">{r.scores[k]}</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground italic">"{r.critique}"</p>
                          <p className="text-[10px] text-muted-foreground">Predicted: <span className={r.predictedDelta > 0 ? "text-green-400" : "text-destructive"}>{r.predictedDelta > 0 ? "+" : ""}{r.predictedDelta} pts</span></p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Button onClick={handleApply} disabled={applying || !gate?.gatePassed} className="w-full h-9 text-xs" size="sm" title={!gate?.gatePassed ? "Gates must pass before deploy" : ""}>
            {applying ? (
              <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Deploying to canary...</>
            ) : (
              <><Zap className="h-3 w-3 mr-2" />Deploy Winner to Canary</>
            )}
          </Button>
        </motion.div>
      )}
    </div>
  );
}

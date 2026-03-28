import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Loader2, BookOpen, ExternalLink, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronUp, FileText, HelpCircle, Lightbulb,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { runResearch, type ResearchReport, type Citation } from "@/lib/emma-stream";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

interface ResearchPanelProps {
  onCreateArtifact?: (title: string, content: string, type: string) => void;
}

export function ResearchPanel({ onCreateArtifact }: ResearchPanelProps) {
  const [objective, setObjective] = useState("");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [viewMode, setViewMode] = useState<"summary" | "full">("summary");

  const handleResearch = async () => {
    if (!objective.trim()) { toast.error("Enter a research objective"); return; }
    setRunning(true);
    setReport(null);
    try {
      const result = await runResearch(objective.trim());
      setReport(result);
      toast.success(`Research complete! Confidence: ${result.confidence}%`);
    } catch (err: any) {
      toast.error(err.message);
    }
    setRunning(false);
  };

  const confidenceColor = (c: number) => c >= 75 ? "text-green-400" : c >= 50 ? "text-accent" : "text-destructive";

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Deep Research</h3>
        </div>
        <div className="flex gap-2">
          <input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="What would you like to research?"
            className="flex-1 bg-secondary text-foreground text-sm rounded-xl px-4 py-2.5 outline-none border border-border focus:border-primary transition-colors"
            onKeyDown={(e) => e.key === "Enter" && !running && handleResearch()}
          />
          <Button onClick={handleResearch} disabled={running} size="sm" className="h-10 px-4 rounded-xl">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {running && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="font-mono">Researching... This may take 30-60 seconds.</span>
          </div>
        )}
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        {report && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 space-y-4">
            {/* Confidence & Meta */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1 ${confidenceColor(report.confidence)}`}>
                  {report.confidence >= 75 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  <span className="text-xs font-mono">{report.confidence}% confidence</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{report.sources.length} sources</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setViewMode("summary")}
                  className={`text-[10px] px-2 py-0.5 rounded-full ${viewMode === "summary" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  Summary
                </button>
                <button
                  onClick={() => setViewMode("full")}
                  className={`text-[10px] px-2 py-0.5 rounded-full ${viewMode === "full" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  Full Report
                </button>
              </div>
            </div>

            {/* Key Insights */}
            {(report as any).keyInsights?.length > 0 && (
              <div className="emma-surface-elevated rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-mono text-accent flex items-center gap-1"><Lightbulb className="h-3 w-3" /> KEY INSIGHTS</p>
                {(report as any).keyInsights.map((insight: string, i: number) => (
                  <p key={i} className="text-xs text-foreground flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">{i + 1}.</span>
                    {insight}
                  </p>
                ))}
              </div>
            )}

            {/* Executive Summary */}
            <div className="emma-surface-elevated emma-glow-border rounded-xl p-4">
              <p className="text-[10px] font-mono text-primary mb-2">EXECUTIVE SUMMARY</p>
              <p className="text-sm text-foreground leading-relaxed">{report.summary}</p>
            </div>

            {/* Full Report */}
            {viewMode === "full" && (
              <div className="emma-surface-elevated rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-mono text-primary flex items-center gap-1"><FileText className="h-3 w-3" /> DETAILED REPORT</p>
                  {onCreateArtifact && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => onCreateArtifact(`Research: ${report.objective}`, report.fullReport, "report")}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Save as Artifact
                    </Button>
                  )}
                </div>
                <div className="prose prose-sm prose-invert max-w-none text-foreground [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_a]:text-primary [&_strong]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-foreground">
                  <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                    {report.fullReport}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {/* Sources */}
            <div className="emma-surface-elevated rounded-xl p-3">
              <button onClick={() => setShowSources(!showSources)} className="w-full flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> SOURCES ({report.sources.length})
                </span>
                {showSources ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              </button>
              <AnimatePresence>
                {showSources && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-2 space-y-1.5">
                      {report.sources.map((s, i) => (
                        <div key={i} className="bg-secondary/50 rounded-lg p-2 flex items-start gap-2">
                          <span className="text-[10px] font-mono text-primary font-bold mt-0.5">[{s.id}]</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-foreground font-medium flex items-center gap-1">
                              {s.title}
                              {s.url && <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{s.snippet}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Open Questions */}
            {report.openQuestions.length > 0 && (
              <div className="emma-surface-elevated rounded-xl p-3">
                <button onClick={() => setShowQuestions(!showQuestions)} className="w-full flex items-center justify-between">
                  <span className="text-[10px] font-mono text-accent flex items-center gap-1">
                    <HelpCircle className="h-3 w-3" /> OPEN QUESTIONS ({report.openQuestions.length})
                  </span>
                  {showQuestions ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </button>
                <AnimatePresence>
                  {showQuestions && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-2 space-y-1">
                        {report.openQuestions.map((q, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-2">
                            <HelpCircle className="h-2.5 w-2.5 text-accent mt-0.5 flex-shrink-0" />
                            {q}
                          </p>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Research Plan */}
            <div className="emma-surface-elevated rounded-xl p-3">
              <p className="text-[10px] font-mono text-muted-foreground mb-2">RESEARCH PLAN</p>
              <div className="space-y-1">
                {report.plan.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-400 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-foreground">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {!report && !running && (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6">
            <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Enter a research objective above</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Emma will plan, research, and synthesize a comprehensive report with citations
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

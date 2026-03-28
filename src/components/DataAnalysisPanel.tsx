import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { BarChart3, Upload, Loader2, FileText, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { streamChat, type Message } from "@/lib/emma-stream";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

export function DataAnalysisPanel() {
  const [fileContent, setFileContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [analysis, setAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setFileContent(content.slice(0, 50000)); // Limit to 50k chars
      toast.success(`Loaded ${file.name} (${content.length} chars)`);
    };
    reader.readAsText(file);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!fileContent && !question.trim()) return;
    setIsAnalyzing(true);
    setAnalysis("");

    const prompt = question.trim() || "Analyze this data. Provide summary statistics, key patterns, and insights.";
    const fullPrompt = fileContent
      ? `File: ${fileName}\n\nData (first 10000 chars):\n\`\`\`\n${fileContent.slice(0, 10000)}\n\`\`\`\n\nQuestion: ${prompt}`
      : prompt;

    const messages: Message[] = [{ role: "user", content: fullPrompt }];
    let result = "";

    try {
      await streamChat({
        messages,
        mode: "data",
        answerStyle: "deep",
        onDelta: (chunk) => {
          result += chunk;
          setAnalysis(result);
        },
        onDone: () => setIsAnalyzing(false),
        onError: (err) => { setIsAnalyzing(false); toast.error(err); },
      });
    } catch {
      setIsAnalyzing(false);
      toast.error("Analysis failed");
    }
  }, [fileContent, fileName, question]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Data Analysis</h3>
        </div>

        {/* File input */}
        <label className="emma-surface-elevated emma-glow-border rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-secondary/50 transition-colors">
          <Upload className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-xs text-foreground">{fileName || "Upload CSV, JSON, or text file"}</p>
            {fileContent && <p className="text-[10px] text-muted-foreground">{fileContent.length} chars loaded</p>}
          </div>
          <input type="file" accept=".csv,.json,.txt,.md,.tsv,.xml" className="hidden" onChange={handleFileLoad} />
        </label>

        {/* Preview */}
        {fileContent && (
          <div className="emma-surface-elevated rounded-lg p-2 max-h-24 overflow-auto">
            <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">{fileContent.slice(0, 500)}...</pre>
          </div>
        )}

        {/* Question */}
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about the data..."
            className="flex-1 bg-secondary text-foreground text-sm rounded-xl px-4 py-2.5 outline-none border border-border focus:border-primary"
            onKeyDown={(e) => e.key === "Enter" && !isAnalyzing && handleAnalyze()}
          />
          <Button onClick={handleAnalyze} disabled={isAnalyzing || (!fileContent && !question.trim())} size="sm" className="h-10 rounded-xl">
            {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {analysis ? (
          <div className="p-4">
            <div className="prose prose-sm prose-invert max-w-none text-foreground [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-secondary [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_a]:text-primary [&_strong]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-foreground [&_table]:w-full [&_th]:text-foreground [&_td]:text-muted-foreground">
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{analysis}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6">
            <Table2 className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Upload a file or ask a data question</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Supports CSV, JSON, text analysis with insights and statistics
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

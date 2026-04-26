import { useState, useEffect } from "react";
import { Play, Loader2, Terminal as TerminalIcon, Image as ImageIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Language = "python" | "javascript" | "typescript" | "bash";

interface ExecResult {
  success: boolean;
  language: string;
  stdout: string;
  stderr: string;
  results?: Array<{ type: string; value: unknown }>;
  error?: { name: string; value: string; traceback?: string } | null;
  durationMs: number;
}

const SAMPLES: Record<Language, string> = {
  python: `import math\nprint("π =", math.pi)\nprint("Sum 1..100 =", sum(range(1, 101)))`,
  javascript: `const fib = n => n < 2 ? n : fib(n-1) + fib(n-2);\nconsole.log("fib(10) =", fib(10));`,
  typescript: `const greet = (name: string): string => \`Hello, \${name}!\`;\nconsole.log(greet("Emma"));`,
  bash: `echo "Sandbox: $(uname -a)"\necho "Date: $(date)"\nls /`,
};

export function CodeRunner() {
  const { getToken } = useAuth();
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState(SAMPLES.python);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecResult | null>(null);

  useEffect(() => {
    setCode((c) => (c === SAMPLES.python || c === SAMPLES.javascript || c === SAMPLES.typescript || c === SAMPLES.bash ? SAMPLES[language] : c));
  }, [language]);

  const run = async () => {
    if (!code.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("Sign in to run code");
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-code-exec`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, language, timeoutMs: 30_000 }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast.error(data.error || `Execution failed (${resp.status})`);
        setResult({
          success: false,
          language,
          stdout: "",
          stderr: "",
          error: { name: "RequestError", value: data.error || `HTTP ${resp.status}` },
          durationMs: 0,
        });
        return;
      }
      setResult(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Code Runner</span>
          <Badge variant="outline" className="text-[10px]">e2b sandbox</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="python">Python</SelectItem>
              <SelectItem value="javascript">JavaScript</SelectItem>
              <SelectItem value="typescript">TypeScript</SelectItem>
              <SelectItem value="bash">Bash</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={run} disabled={running} className="h-8">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            <span className="ml-1.5 text-xs">Run</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="flex-1 min-h-[160px] resize-none rounded-none border-0 border-b border-border font-mono text-xs bg-card focus-visible:ring-0"
          placeholder={`# Write ${language} code…`}
        />

        <ScrollArea className="flex-1 bg-muted/20">
          <div className="p-3 space-y-2 font-mono text-xs">
            {!result && !running && (
              <p className="text-muted-foreground italic">Press Run to execute in a sandboxed VM. Output appears here.</p>
            )}
            {running && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Executing in e2b sandbox…</span>
              </div>
            )}
            {result && (
              <>
                <div className="flex items-center gap-2 pb-1 border-b border-border">
                  <Badge variant={result.success ? "default" : "destructive"} className="text-[10px]">
                    {result.success ? "OK" : "ERROR"}
                  </Badge>
                  <span className="text-muted-foreground">{result.language}</span>
                  <span className="text-muted-foreground">· {result.durationMs}ms</span>
                </div>
                {result.stdout && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">stdout</div>
                    <pre className="whitespace-pre-wrap text-foreground">{result.stdout}</pre>
                  </div>
                )}
                {result.stderr && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-destructive mb-1">stderr</div>
                    <pre className="whitespace-pre-wrap text-destructive/90">{result.stderr}</pre>
                  </div>
                )}
                {result.results && result.results.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">results</div>
                    {result.results.map((r, i) => (
                      <div key={i} className="border border-border rounded p-2 bg-card">
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-muted-foreground">
                          {r.type.startsWith("image") && <ImageIcon className="h-3 w-3" />}
                          {r.type}
                        </div>
                        {r.type === "image/png" ? (
                          <img src={`data:image/png;base64,${r.value}`} alt="output" className="max-w-full rounded" />
                        ) : r.type === "text/html" ? (
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: String(r.value) }}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap">{typeof r.value === "string" ? r.value : JSON.stringify(r.value, null, 2)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {result.error && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-destructive mb-1">{result.error.name}</div>
                    <pre className="whitespace-pre-wrap text-destructive/90">{result.error.value}</pre>
                    {result.error.traceback && (
                      <pre className="whitespace-pre-wrap text-destructive/70 mt-1 opacity-80">{result.error.traceback}</pre>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

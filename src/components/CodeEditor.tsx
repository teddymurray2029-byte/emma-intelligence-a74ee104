import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from "react";
import Editor from "@monaco-editor/react";
import { X, Plus, Play, Terminal as TerminalIcon, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Terminal } from "./Terminal";
import { ensureSession, shellExec, configureSandbox } from "@/lib/sandbox";

interface FileTab {
  name: string;
  language: string;
  content: string;
  dirty?: boolean;
}

export interface CodeEditorHandle {
  openCode: (code: string, language: string, name?: string) => void;
}

interface CodeEditorProps {
  getToken: () => Promise<string | null>;
}

const DEFAULT_FILE: FileTab = {
  name: "main.tsx",
  language: "typescript",
  content: `// Welcome to Emma IDE\n// • Open a project on the left, or paste code here\n// • Press ▶ to run inside the VM (node / python3 / bash)\n// • Open the terminal for a real Linux shell\n\nexport default function App() {\n  return <h1>Hello, Emma</h1>;\n}\n`,
};

const LS_KEY = "emma-editor-files";

function loadFiles(): FileTab[] {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [DEFAULT_FILE];
}

function detectRunner(name: string, language: string): { cmd: (path: string) => string; ext: string } | null {
  const ext = name.split(".").pop()?.toLowerCase() || language;
  if (["py"].includes(ext)) return { cmd: (p) => `python3 ${p}`, ext: "py" };
  if (["js", "mjs", "cjs"].includes(ext)) return { cmd: (p) => `node ${p}`, ext };
  if (["ts"].includes(ext)) return { cmd: (p) => `npx -y tsx ${p}`, ext };
  if (["sh", "bash"].includes(ext)) return { cmd: (p) => `bash ${p}`, ext };
  if (["go"].includes(ext)) return { cmd: (p) => `go run ${p}`, ext };
  return null;
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({ getToken }, ref) {
  const [files, setFiles] = useState<FileTab[]>(loadFiles);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showTerm, setShowTerm] = useState(false);
  const [running, setRunning] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const active = files[activeIdx] || files[0];

  useEffect(() => { configureSandbox(getToken); }, [getToken]);
  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(files)); }, [files]);

  // Broadcast the active file as IDE context for the floating chat.
  useEffect(() => {
    if (!active) return;
    import("@/lib/ide-context").then(({ setIdeContext }) => {
      setIdeContext({ activeFile: { path: active.name, language: active.language, content: active.content } });
    });
  }, [active?.name, active?.content, active?.language]);

  useImperativeHandle(ref, () => ({
    openCode: (code, language, name) => {
      const ext = language === "typescript" ? "tsx" : language === "javascript" ? "js" : language === "python" ? "py" : language;
      const fileName = name || `snippet_${files.length}.${ext}`;
      // If a tab with the same name already exists, just focus it and update content
      const existingIdx = files.findIndex(f => f.name === fileName);
      if (existingIdx >= 0) {
        setFiles(prev => prev.map((f, i) => i === existingIdx ? { ...f, content: code } : f));
        setActiveIdx(existingIdx);
      } else {
        setFiles((prev) => [...prev, { name: fileName, language, content: code }]);
        setActiveIdx(files.length);
      }
      toast.success(`Opened: ${fileName}`);
    },
  }));

  const handleRun = async () => {
    if (!active) return;
    const runner = detectRunner(active.name, active.language);
    if (!runner) {
      toast.error(`No runner for .${active.name.split(".").pop()} — try .py / .js / .ts / .sh`);
      setShowTerm(true);
      return;
    }
    setShowTerm(true);
    setRunning(true);
    try {
      await ensureSession();
      const tmpName = `/tmp/emma_run_${Date.now()}.${runner.ext}`;
      // Write file via shell heredoc — escape EOF tag uniqueness with random marker
      const marker = `EMMA_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const escapedContent = active.content.replace(new RegExp(marker, "g"), "");
      const writeCmd = `cat > ${tmpName} << '${marker}'\n${escapedContent}\n${marker}`;
      await shellExec(writeCmd, { timeout: 10 });
      const result = await shellExec(runner.cmd(tmpName), { timeout: 60 });
      const stamp = new Date().toLocaleTimeString();
      const out = [
        `\n▶ run ${active.name}  ${stamp}`,
        result.stdout && `${result.stdout.trim()}`,
        result.stderr && `⚠ ${result.stderr.trim()}`,
        `[exit ${result.exitCode}]`,
      ].filter(Boolean).join("\n");
      // Write the run banner into the terminal via a no-op echo so it shows there.
      await shellExec(`printf '%s\\n' ${JSON.stringify(out)}`, { timeout: 5 }).catch(() => {});
      toast.success(`Run complete (exit ${result.exitCode})`);
    } catch (e: any) {
      toast.error(e?.message || "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const handleSave = () => {
    if (!active) return;
    setFiles((prev) => prev.map((f, i) => (i === activeIdx ? { ...f, dirty: false } : f)));
    toast.success(`Saved ${active.name}`);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center border-b border-border bg-card overflow-x-auto">
        {files.map((f, i) => (
          <button
            key={f.name + i}
            onClick={() => setActiveIdx(i)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border-r border-border transition-colors ${
              i === activeIdx ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.name}{f.dirty && <span className="text-primary">●</span>}
            {files.length > 1 && (
              <X className="h-3 w-3 opacity-50 hover:opacity-100" onClick={(e) => {
                e.stopPropagation();
                setFiles((prev) => prev.filter((_, j) => j !== i));
                if (activeIdx >= i && activeIdx > 0) setActiveIdx(activeIdx - 1);
              }} />
            )}
          </button>
        ))}
        <Button variant="ghost" size="icon" className="h-8 w-8 ml-1" onClick={() => {
          const newFile: FileTab = { name: `file${files.length + 1}.ts`, language: "typescript", content: "" };
          setFiles((prev) => [...prev, newFile]);
          setActiveIdx(files.length);
        }}>
          <Plus className="h-3 w-3" />
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 mr-1" onClick={handleSave}>
          <Save className="h-3 w-3" /> Save
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 mr-1" disabled={running} onClick={handleRun}>
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Run
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-2 text-xs gap-1 mr-1 ${showTerm ? "text-primary" : ""}`}
          onClick={() => setShowTerm(!showTerm)}
        >
          <TerminalIcon className="h-3 w-3" />
          Terminal
        </Button>
      </div>
      <div className={showTerm ? "h-[55%]" : "flex-1"}>
        <Editor
          height="100%"
          language={active.language}
          value={active.content}
          onChange={(val) => { setFiles((prev) => prev.map((f, i) => (i === activeIdx ? { ...f, content: val || "", dirty: true } : f))); }}
          theme="vs-dark"
          options={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", minimap: { enabled: false }, padding: { top: 12 }, scrollBeyondLastLine: false, renderLineHighlight: "line", lineNumbers: "on", automaticLayout: true, smoothScrolling: true, cursorBlinking: "smooth", bracketPairColorization: { enabled: true } }}
        />
      </div>
      {showTerm && (
        <div ref={termRef} className="h-[45%] min-h-[160px]">
          <Terminal getToken={getToken} />
        </div>
      )}
    </div>
  );
});

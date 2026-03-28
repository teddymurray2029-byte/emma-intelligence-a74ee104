import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import Editor from "@monaco-editor/react";
import { X, Plus, Play, Terminal as TerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FileTab {
  name: string;
  language: string;
  content: string;
}

export interface CodeEditorHandle {
  openCode: (code: string, language: string) => void;
}

const DEFAULT_FILE: FileTab = {
  name: "main.tsx",
  language: "typescript",
  content: `// Welcome to Emma IDE\n// Open code blocks from chat to edit here\n\nexport default function App() {\n  return <h1>Hello, Emma</h1>;\n}\n`,
};

const LS_KEY = "emma-editor-files";

function loadFiles(): FileTab[] {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [DEFAULT_FILE];
}

export const CodeEditor = forwardRef<CodeEditorHandle>(function CodeEditor(_, ref) {
  const [files, setFiles] = useState<FileTab[]>(loadFiles);
  const [activeIdx, setActiveIdx] = useState(0);
  const [termOutput, setTermOutput] = useState<string[]>([]);
  const [showTerm, setShowTerm] = useState(false);
  const active = files[activeIdx] || files[0];

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(files));
  }, [files]);

  // Expose openCode to parent
  useImperativeHandle(ref, () => ({
    openCode: (code: string, language: string) => {
      const ext = language === "typescript" || language === "tsx" ? "tsx" : language === "javascript" ? "js" : language === "python" ? "py" : language;
      const name = `snippet_${files.length}.${ext}`;
      const newFile: FileTab = { name, language, content: code };
      setFiles((prev) => [...prev, newFile]);
      setActiveIdx(files.length);
      toast.success(`Opened in editor: ${name}`);
    },
  }));

  const handleRun = () => {
    setShowTerm(true);
    setTermOutput((prev) => [
      ...prev,
      `> Running ${active.name}...`,
      "⚠️ Code execution requires E2B API key.",
      "  Configure in Settings → Integrations to enable sandboxed execution.",
      "",
    ]);
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
            {f.name}
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
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 mr-1" onClick={handleRun}>
          <Play className="h-3 w-3" />
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
      <div className={`flex-1 ${showTerm ? "h-[60%]" : ""}`}>
        <Editor
          height="100%"
          language={active.language}
          value={active.content}
          onChange={(val) => { setFiles((prev) => prev.map((f, i) => (i === activeIdx ? { ...f, content: val || "" } : f))); }}
          theme="vs-dark"
          options={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", minimap: { enabled: false }, padding: { top: 12 }, scrollBeyondLastLine: false, renderLineHighlight: "line", lineNumbers: "on", automaticLayout: true }}
        />
      </div>
      {showTerm && (
        <div className="h-[30%] min-h-[100px] border-t border-border bg-card overflow-auto p-3">
          <div className="font-mono text-xs text-muted-foreground space-y-0.5">
            {termOutput.length === 0 ? (
              <p className="text-muted-foreground/50">Terminal output will appear here...</p>
            ) : (
              termOutput.map((line, i) => (
                <p key={i} className={line.startsWith("⚠️") ? "text-accent" : ""}>{line}</p>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});

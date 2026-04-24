import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import {
  X, Plus, Play, Terminal as TerminalIcon, Save, Loader2,
  Square, Columns2, Rows2, Columns3, Rows3, LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Terminal } from "./Terminal";
import { ensureSession, shellExec, configureSandbox } from "@/lib/sandbox";
import { defineEmmaMonacoTheme, EMMA_THEME_NAME } from "@/lib/monaco-theme";

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

// ───────────────────────────────────────────────────────────────
// Layout system: split editor area into N panes (1, 2, 3, 4)
// ───────────────────────────────────────────────────────────────
type LayoutId = "single" | "cols-2" | "rows-2" | "cols-3" | "rows-3" | "grid-2x2";

interface LayoutDef {
  id: LayoutId;
  panes: number;
  label: string;
  icon: React.ElementType;
  className: string;
}

const LAYOUTS: LayoutDef[] = [
  { id: "single",   panes: 1, label: "Single",      icon: Square,     className: "grid grid-cols-1 grid-rows-1" },
  { id: "cols-2",   panes: 2, label: "2 Columns",   icon: Columns2,   className: "grid grid-cols-2 grid-rows-1" },
  { id: "rows-2",   panes: 2, label: "2 Rows",      icon: Rows2,      className: "grid grid-cols-1 grid-rows-2" },
  { id: "cols-3",   panes: 3, label: "3 Columns",   icon: Columns3,   className: "grid grid-cols-3 grid-rows-1" },
  { id: "rows-3",   panes: 3, label: "3 Rows",      icon: Rows3,      className: "grid grid-cols-1 grid-rows-3" },
  { id: "grid-2x2", panes: 4, label: "2 × 2 Grid",  icon: LayoutGrid, className: "grid grid-cols-2 grid-rows-2" },
];

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({ getToken }, ref) {
  const [files, setFiles] = useState<FileTab[]>(loadFiles);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showTerm, setShowTerm] = useState(false);
  const [running, setRunning] = useState(false);
  const [layoutId, setLayoutId] = useState<LayoutId>("single");
  // Per-pane active tab index (max 4 panes). Falls back to global activeIdx for pane 0.
  const [paneTabs, setPaneTabs] = useState<number[]>([0, 0, 0, 0]);
  // Which pane currently has focus — drives toolbar Save/Run target.
  const [focusedPane, setFocusedPane] = useState(0);
  const termRef = useRef<HTMLDivElement>(null);

  const layout = LAYOUTS.find(l => l.id === layoutId)!;
  const active = files[activeIdx] || files[0];

  useEffect(() => { configureSandbox(getToken); }, [getToken]);
  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(files)); }, [files]);

  // Broadcast the active file as IDE context for the floating chat.
  useEffect(() => {
    setPaneTabs(prev => prev.map(i => Math.min(i, Math.max(0, files.length - 1))));
  }, [files.length]);

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
      const existingIdx = files.findIndex(f => f.name === fileName);
      if (existingIdx >= 0) {
        setFiles(prev => prev.map((f, i) => i === existingIdx ? { ...f, content: code } : f));
        setActiveIdx(existingIdx);
        setPaneTabs(prev => prev.map((t, i) => i === focusedPane ? existingIdx : t));
      } else {
        const newIdx = files.length;
        setFiles((prev) => [...prev, { name: fileName, language, content: code }]);
        setActiveIdx(newIdx);
        setPaneTabs(prev => prev.map((t, i) => i === focusedPane ? newIdx : t));
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

  // When a pane's tab changes, if it's the focused pane, also bump global activeIdx
  const setPaneTab = (paneIndex: number, fileIdx: number) => {
    setPaneTabs(prev => prev.map((t, i) => i === paneIndex ? fileIdx : t));
    if (paneIndex === focusedPane) setActiveIdx(fileIdx);
  };

  const focusPane = (paneIndex: number) => {
    setFocusedPane(paneIndex);
    setActiveIdx(paneTabs[paneIndex] ?? 0);
  };

  const handleEditorChange = (paneIndex: number, fileIdx: number, val: string | undefined) => {
    setFiles(prev => prev.map((f, i) => i === fileIdx ? { ...f, content: val || "", dirty: true } : f));
    if (paneIndex === focusedPane) setActiveIdx(fileIdx);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center border-b border-border bg-card overflow-x-auto">
        {files.map((f, i) => (
          <button
            key={f.name + i}
            onClick={() => { setActiveIdx(i); setPaneTab(focusedPane, i); }}
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
          setPaneTab(focusedPane, files.length);
        }}>
          <Plus className="h-3 w-3" />
        </Button>
        <div className="flex-1" />

        {/* Layout switcher */}
        <div className="flex items-center gap-0.5 mr-2 border-l border-border pl-2">
          {LAYOUTS.map((l) => {
            const Icon = l.icon;
            const isActive = layoutId === l.id;
            return (
              <button
                key={l.id}
                title={l.label}
                aria-label={l.label}
                aria-pressed={isActive}
                onClick={() => {
                  setLayoutId(l.id);
                  // Seed any unseeded panes with sensible defaults (next files)
                  setPaneTabs(prev => {
                    const next = [...prev];
                    for (let i = 0; i < l.panes; i++) {
                      if (next[i] == null || next[i] >= files.length) {
                        next[i] = Math.min(i, Math.max(0, files.length - 1));
                      }
                    }
                    return next;
                  });
                  if (focusedPane >= l.panes) setFocusedPane(0);
                }}
                className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

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
        <div className={`${layout.className} h-full w-full gap-px bg-border`}>
          {Array.from({ length: layout.panes }).map((_, paneIndex) => {
            const fileIdx = Math.min(paneTabs[paneIndex] ?? 0, files.length - 1);
            const file = files[fileIdx];
            const isFocused = paneIndex === focusedPane;
            return (
              <div
                key={paneIndex}
                onMouseDown={() => focusPane(paneIndex)}
                className={`flex flex-col min-w-0 min-h-0 bg-background relative ${
                  isFocused && layout.panes > 1 ? "ring-1 ring-primary/40 ring-inset" : ""
                }`}
              >
                {layout.panes > 1 && (
                  <div className="flex items-center gap-0.5 px-1 py-0.5 border-b border-border bg-card/60 overflow-x-auto">
                    {files.map((f, i) => (
                      <button
                        key={f.name + i}
                        onClick={(e) => { e.stopPropagation(); focusPane(paneIndex); setPaneTab(paneIndex, i); }}
                        className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors whitespace-nowrap ${
                          i === fileIdx
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                        }`}
                      >
                        {f.name}{f.dirty && <span className="text-primary ml-0.5">●</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  {file ? (
                    <Editor
                      height="100%"
                      language={file.language}
                      value={file.content}
                      onChange={(val) => handleEditorChange(paneIndex, fileIdx, val)}
                      theme={EMMA_THEME_NAME}
                      beforeMount={(monaco) => defineEmmaMonacoTheme(monaco)}
                      options={{
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontLigatures: true,
                        minimap: { enabled: layout.panes === 1 },
                        padding: { top: 12, bottom: 12 },
                        scrollBeyondLastLine: false,
                        renderLineHighlight: "all",
                        lineNumbers: "on",
                        automaticLayout: true,
                        smoothScrolling: true,
                        cursorBlinking: "phase",
                        cursorSmoothCaretAnimation: "on",
                        cursorWidth: 2,
                        bracketPairColorization: { enabled: true },
                        guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true },
                        roundedSelection: true,
                        renderWhitespace: "selection",
                        fontWeight: "500",
                      }}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
                      No file
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showTerm && (
        <div ref={termRef} className="h-[45%] min-h-[160px]">
          <Terminal getToken={getToken} />
        </div>
      )}
    </div>
  );
});

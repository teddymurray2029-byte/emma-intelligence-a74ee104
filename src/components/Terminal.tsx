import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Loader2, Power, Trash2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { configureSandbox, ensureSession, shellExec, getSandboxStatus, onSandboxStatus, stopSession, type SessionStatus } from "@/lib/sandbox";
import { pushTerminal } from "@/lib/ide-context";

interface TerminalProps {
  getToken: () => Promise<string | null>;
  cwd?: string;
}

type Line = { kind: "out" | "err" | "cmd" | "info"; text: string };

const PROMPT = "user@emma-vm:~$";

export function Terminal({ getToken, cwd }: TerminalProps) {
  const [lines, setLines] = useState<Line[]>([
    { kind: "info", text: "Emma sandbox terminal — Linux VM, full bash. Type 'help' or any shell command." },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number>(-1);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<SessionStatus>(getSandboxStatus());
  const [workdir, setWorkdir] = useState<string>(cwd || "/home/user");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    configureSandbox(getToken);
    const off = onSandboxStatus((s, msg) => {
      setStatus(s);
      if (msg) setLines((p) => [...p, { kind: "info", text: `• ${msg}` }]);
    });
    return () => { off(); };
  }, [getToken]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, running]);

  const append = (l: Line | Line[]) => setLines((p) => p.concat(Array.isArray(l) ? l : [l]));

  const runCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    append({ kind: "cmd", text: `${PROMPT.replace(":~", `:${workdir.replace("/home/user", "~")}`)} ${trimmed}` });
    setHistory((h) => [...h, trimmed]);
    setHistIdx(-1);

    if (trimmed === "clear" || trimmed === "cls") {
      setLines([]); return;
    }
    if (trimmed === "help") {
      append({ kind: "info", text: "Available: any bash command (ls, cat, node, python3, npm, git, curl…). 'clear' to wipe, 'pwd' to see cwd." });
      return;
    }

    setRunning(true);
    try {
      // cd handling — track cwd locally
      const cdMatch = trimmed.match(/^cd\s+(.+)$/);
      if (cdMatch) {
        const target = cdMatch[1].trim().replace(/^~/, "/home/user");
        const r = await shellExec(`cd ${JSON.stringify(target)} && pwd`, { cwd: workdir });
        if (r.exitCode === 0) setWorkdir(r.stdout.trim());
        else append({ kind: "err", text: r.stderr || r.stdout });
      } else {
        const r = await shellExec(trimmed, { cwd: workdir, timeout: 60 });
        if (r.stdout) append({ kind: "out", text: r.stdout.replace(/\n$/, "") });
        if (r.stderr) append({ kind: "err", text: r.stderr.replace(/\n$/, "") });
        if (r.exitCode !== 0 && !r.stdout && !r.stderr) append({ kind: "err", text: `[exit ${r.exitCode}]` });
      }
    } catch (e: any) {
      append({ kind: "err", text: `✗ ${e?.message || "Command failed"}` });
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [workdir]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !running) {
      const v = input;
      setInput("");
      runCommand(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const next = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next); setInput(history[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const next = histIdx + 1;
      if (next >= history.length) { setHistIdx(-1); setInput(""); }
      else { setHistIdx(next); setInput(history[next]); }
    } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); setLines([]);
    }
  };

  const promptLabel = `${PROMPT.replace(":~", `:${workdir.replace("/home/user", "~")}`)} `;

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--background))] border-t border-border">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card">
        <Circle className={`h-2 w-2 ${status === "ready" ? "fill-green-500 text-green-500" : status === "starting" ? "fill-yellow-500 text-yellow-500 animate-pulse" : status === "error" ? "fill-destructive text-destructive" : "fill-muted text-muted"}`} />
        <span className="text-[11px] font-mono text-muted-foreground">
          VM {status === "ready" ? "online" : status === "starting" ? "booting…" : status === "error" ? "error" : "offline"}
        </span>
        <span className="text-[11px] font-mono text-muted-foreground/60 truncate flex-1">{workdir}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Boot VM" onClick={() => ensureSession().catch(() => {})}>
          <Power className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Clear" onClick={() => setLines([])}>
          <Trash2 className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Stop VM" onClick={() => stopSession()}>
          <span className="text-[10px] font-mono">⏻</span>
        </Button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-[12px] leading-relaxed" onClick={() => inputRef.current?.focus()}>
        {lines.map((l, i) => (
          <pre key={i} className={`whitespace-pre-wrap break-words ${
            l.kind === "err" ? "text-destructive" :
            l.kind === "cmd" ? "text-primary" :
            l.kind === "info" ? "text-muted-foreground italic" : "text-foreground"
          }`}>{l.text}</pre>
        ))}
        <div className="flex items-center gap-1">
          <span className="text-primary whitespace-pre">{promptLabel}</span>
          <input
            ref={inputRef}
            value={input}
            disabled={running}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 bg-transparent outline-none text-foreground caret-primary"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
          />
          {running && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
      </div>
    </div>
  );
}

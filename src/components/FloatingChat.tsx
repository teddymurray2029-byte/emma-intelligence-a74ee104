import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Minus, Send, Loader2, GitCommit, FileText, Terminal as TerminalIcon, AlertTriangle, CheckCircle2, Sparkles, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { streamChat, type Message } from "@/lib/emma-stream";
import { onIdeContext, getIdeContext, type IdeContext } from "@/lib/ide-context";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const GITHUB_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-github`;

interface FloatingChatProps {
  getToken: () => Promise<string | null>;
  /** Called when chat suggests applying code to the active file */
  onApplyToFile?: (path: string, content: string) => void;
}

type ChatMsg = Message & { logs?: string[] };

function buildContextBlock(ctx: IdeContext): string {
  const parts: string[] = ["# IDE_CONTEXT"];
  if (ctx.projectName) parts.push(`Project: **${ctx.projectName}**${ctx.githubRepo ? ` (github: ${ctx.githubRepo})` : ""}`);
  if (ctx.files?.length) parts.push(`Files (${ctx.files.length}): ${ctx.files.slice(0, 30).map(f => f.path).join(", ")}${ctx.files.length > 30 ? "…" : ""}`);
  if (ctx.activeFile) {
    const truncated = ctx.activeFile.content.length > 6000
      ? ctx.activeFile.content.slice(0, 6000) + "\n…[truncated]"
      : ctx.activeFile.content;
    parts.push(`\n## Active file: \`${ctx.activeFile.path}\` (${ctx.activeFile.language})\n\`\`\`${ctx.activeFile.language}\n${truncated}\n\`\`\``);
  }
  if (ctx.lastTerminal) {
    const t = ctx.lastTerminal;
    parts.push(`\n## Last terminal command\n\`$ ${t.command}\` → exit ${t.exitCode}\n${t.stdout ? `stdout:\n\`\`\`\n${t.stdout.slice(-1500)}\n\`\`\`` : ""}${t.stderr ? `\nstderr:\n\`\`\`\n${t.stderr.slice(-1500)}\n\`\`\`` : ""}`);
  }
  if (ctx.lastError) parts.push(`\n## Recent error\n\`\`\`\n${ctx.lastError.slice(0, 1000)}\n\`\`\``);
  return parts.join("\n");
}

export function FloatingChat({ getToken, onApplyToFile }: FloatingChatProps) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState<IdeContext>(getIdeContext());
  const [logs, setLogs] = useState<{ at: number; text: string; kind: "info" | "ok" | "err" }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 24, y: 24 });
  const dragState = useRef<{ dx: number; dy: number; dragging: boolean }>({ dx: 0, dy: 0, dragging: false });

  useEffect(() => { const off = onIdeContext(setCtx); return () => { off(); }; }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, logs]);

  const log = useCallback((text: string, kind: "info" | "ok" | "err" = "info") => {
    setLogs((p) => [...p.slice(-30), { at: Date.now(), text, kind }]);
  }, []);

  // --- Drag handling for the header ---
  const startDrag = (e: React.MouseEvent) => {
    if (expanded) return;
    const rect = dragRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, dragging: true };
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", endDrag, { once: true });
  };
  const onDrag = (e: MouseEvent) => {
    if (!dragState.current.dragging) return;
    const x = Math.max(8, window.innerWidth - e.clientX + dragState.current.dx - 360);
    const y = Math.max(8, window.innerHeight - e.clientY + dragState.current.dy - 60);
    setPos({ x, y });
  };
  const endDrag = () => { dragState.current.dragging = false; document.removeEventListener("mousemove", onDrag); };

  const githubCall = async (action: string, params: Record<string, any>) => {
    const token = await getToken();
    const resp = await fetch(GITHUB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, ...params }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.error || `${action} failed`);
    return json;
  };

  const handleCommitPush = async (message: string) => {
    if (!ctx.githubRepo) { toast.error("Connect a GitHub repo in Source Control first"); return; }
    if (!ctx.files?.length) { toast.error("No files to commit"); return; }
    log(`Committing ${ctx.files.length} files to ${ctx.githubRepo}…`);
    setBusy(true);
    try {
      // Fetch the latest file contents from window-level cache via the IDE context
      const fullFiles = (ctx as any).__fullFiles as { path: string; content: string }[] | undefined;
      const files = fullFiles && fullFiles.length ? fullFiles : ctx.files!.map(f => ({ path: f.path, content: "" }));
      await githubCall("push", { repo: ctx.githubRepo, files, message });
      log(`Pushed to ${ctx.githubRepo}`, "ok");
      toast.success(`Pushed to ${ctx.githubRepo}`);
      setMessages((p) => [...p, { role: "assistant", content: `✅ Committed and pushed **${files.length} files** to \`${ctx.githubRepo}\` with message: _${message}_` }]);
    } catch (e: any) {
      log(`Push failed: ${e.message}`, "err");
      toast.error(e.message);
    }
    setBusy(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");

    // Slash commands
    if (text.startsWith("/commit")) {
      const msg = text.replace(/^\/commit\s*/, "").trim() || "Update from Emma IDE";
      setMessages((p) => [...p, { role: "user", content: text }]);
      await handleCommitPush(msg);
      return;
    }
    if (text === "/clear") { setMessages([]); setLogs([]); return; }
    if (text === "/help") {
      setMessages((p) => [...p, { role: "user", content: text }, { role: "assistant", content: "**Slash commands**\n- `/commit <msg>` — commit & push the current project to GitHub\n- `/clear` — clear chat\n- `/help` — show this\n\nAsk me anything about the open file, terminal output, or project. I'll see them automatically." }]);
      return;
    }

    const userMsg: ChatMsg = { role: "user", content: text };
    setMessages((p) => [...p, userMsg]);
    setBusy(true);
    log(ctx.activeFile ? `Reading ${ctx.activeFile.path}…` : "Thinking…");
    if (ctx.lastError) log("Inspecting recent error…");

    const ctxBlock = buildContextBlock(getIdeContext());
    const contextualMessages: Message[] = [
      // Front-load context as a user message; the edge function injects its own system prompt.
      { role: "user", content: `${ctxBlock}\n\n---\n\nUser request:\n${text}` },
    ];

    let assistantSoFar = "";
    setMessages((p) => [...p, { role: "assistant", content: "" }]);

    try {
      await streamChat({
        messages: contextualMessages,
        mode: "chat",
        answerStyle: "standard",
        onDelta: (chunk) => {
          assistantSoFar += chunk;
          setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        },
        onDone: () => {
          setBusy(false);
          log("Response ready", "ok");
          // Auto-detect "apply to file" intent: if reply has a single fenced block matching active file's language
          if (onApplyToFile && ctx.activeFile) {
            const fenced = assistantSoFar.match(/```(?:\w+)?\n([\s\S]*?)```/);
            if (fenced && fenced[1].length > 60 && /apply|replace|update|here'?s the (full|updated) (file|code)/i.test(assistantSoFar)) {
              log(`Suggested edit for ${ctx.activeFile.path}`, "info");
            }
          }
        },
        onError: (err) => {
          setBusy(false);
          log(err, "err");
          setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: `⚠️ ${err}` } : m));
        },
      });
    } catch (e: any) {
      setBusy(false);
      log(e?.message || "Failed", "err");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const applyLastBlock = () => {
    if (!onApplyToFile || !ctx.activeFile) return;
    const last = [...messages].reverse().find(m => m.role === "assistant");
    if (!last) return;
    const fenced = last.content.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (!fenced) { toast.error("No code block in last reply"); return; }
    onApplyToFile(ctx.activeFile.path, fenced[1]);
    log(`Applied edit to ${ctx.activeFile.path}`, "ok");
    toast.success(`Applied to ${ctx.activeFile.path}`);
  };

  // --- Floating launcher button ---
  if (!open) {
    return (
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => { setOpen(true); setMinimized(false); }}
        className="fixed z-50 h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-2xl shadow-primary/30 flex items-center justify-center border border-primary/40 backdrop-blur"
        style={{ right: 24, bottom: 24 }}
        title="Ask Emma about this project"
      >
        <Sparkles className="h-5 w-5" />
      </motion.button>
    );
  }

  const panelStyle = expanded
    ? { right: 24, bottom: 24, width: "min(720px, calc(100vw - 48px))", height: "min(720px, calc(100vh - 96px))" }
    : { right: pos.x, bottom: pos.y, width: 380, height: minimized ? 44 : 520 };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.98 }}
      className="fixed z-50 bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl shadow-primary/10 flex flex-col overflow-hidden"
      style={panelStyle}
    >
      {/* Header (drag handle) */}
      <div
        ref={dragRef}
        onMouseDown={startDrag}
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-gradient-to-r from-primary/10 to-transparent cursor-move select-none"
      >
        <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center">
          <Sparkles className="h-3 w-3 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold">Emma · IDE Assistant</div>
          {!minimized && (
            <div className="text-[10px] text-muted-foreground truncate">
              {ctx.projectName ? `${ctx.projectName}${ctx.activeFile ? ` · ${ctx.activeFile.path}` : ""}` : "No project — open one to add context"}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)} title={expanded ? "Restore" : "Expand"}>
          {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMinimized(!minimized)} title="Minimize">
          <Minus className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)} title="Close">
          <X className="h-3 w-3" />
        </Button>
      </div>

      {!minimized && (
        <>
          {/* Context chips */}
          <div className="px-3 py-1.5 border-b border-border/50 bg-background/40 flex items-center gap-1.5 overflow-x-auto">
            {ctx.activeFile && (
              <Chip icon={FileText} label={ctx.activeFile.path.split("/").pop() || ctx.activeFile.path} tone="primary" />
            )}
            {ctx.lastTerminal && (
              <Chip icon={TerminalIcon} label={`$ ${ctx.lastTerminal.command.slice(0, 18)}${ctx.lastTerminal.command.length > 18 ? "…" : ""}`} tone={ctx.lastTerminal.exitCode === 0 ? "ok" : "err"} />
            )}
            {ctx.lastError && <Chip icon={AlertTriangle} label="error captured" tone="err" />}
            {ctx.githubRepo && <Chip icon={GitCommit} label={ctx.githubRepo} tone="muted" />}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="p-3 space-y-3 text-xs">
              {messages.length === 0 && (
                <div className="text-muted-foreground text-[11px] leading-relaxed space-y-2">
                  <p>Hi — I see your <span className="text-primary">{ctx.activeFile ? ctx.activeFile.path : "workspace"}</span>. Ask me to:</p>
                  <ul className="space-y-1 pl-3">
                    <li>• "Fix the error in the terminal"</li>
                    <li>• "Add a function that…"</li>
                    <li>• "Refactor this file for clarity"</li>
                    <li>• <code className="text-primary">/commit fix bug</code> to push to GitHub</li>
                  </ul>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`rounded-lg p-2.5 ${m.role === "user" ? "bg-primary/10 border border-primary/20 ml-6" : "bg-secondary/40 border border-border mr-6"}`}>
                  <div className="text-[9px] font-mono uppercase text-muted-foreground mb-1">{m.role === "user" ? "you" : "emma"}</div>
                  <div className="prose prose-invert prose-sm max-w-none text-xs prose-pre:my-1.5 prose-pre:text-[10px] prose-pre:bg-background/60 prose-code:text-[10px] prose-p:my-1">
                    <ReactMarkdown>{m.content || (busy && i === messages.length - 1 ? "…" : "")}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {busy && messages[messages.length - 1]?.role === "user" && (
                <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /><span className="text-[10px]">Emma is thinking…</span></div>
              )}
            </div>
          </ScrollArea>

          {/* Action log strip */}
          <AnimatePresence>
            {logs.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-border/50 bg-background/40 px-2 py-1 max-h-[72px] overflow-y-auto"
              >
                {logs.slice(-3).map((l, i) => (
                  <div key={i} className={`text-[9px] font-mono flex items-center gap-1 ${
                    l.kind === "ok" ? "text-green-400" : l.kind === "err" ? "text-destructive" : "text-muted-foreground"
                  }`}>
                    {l.kind === "ok" ? <CheckCircle2 className="h-2.5 w-2.5" /> : l.kind === "err" ? <AlertTriangle className="h-2.5 w-2.5" /> : <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />}
                    <span className="truncate">{l.text}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Composer */}
          <div className="border-t border-border p-2 bg-card">
            <div className="flex gap-1.5 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={ctx.activeFile ? `Ask about ${ctx.activeFile.path.split("/").pop()}…` : "Ask Emma…"}
                className="min-h-[36px] max-h-[120px] resize-none text-xs py-1.5"
                rows={1}
              />
              <Button size="icon" className="h-8 w-8 flex-shrink-0" onClick={send} disabled={busy || !input.trim()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <button
                onClick={applyLastBlock}
                disabled={!ctx.activeFile}
                className="text-[10px] text-muted-foreground hover:text-primary disabled:opacity-40 px-1.5 py-0.5 rounded hover:bg-secondary/40"
                title="Apply last code block to active file"
              >
                Apply edit
              </button>
              <button
                onClick={() => handleCommitPush(`Update from Emma IDE — ${new Date().toLocaleString()}`)}
                disabled={!ctx.githubRepo || busy}
                className="text-[10px] text-muted-foreground hover:text-primary disabled:opacity-40 px-1.5 py-0.5 rounded hover:bg-secondary/40 flex items-center gap-0.5"
              >
                <GitCommit className="h-2.5 w-2.5" /> Commit & push
              </button>
              <span className="flex-1" />
              <span className="text-[9px] text-muted-foreground/60 font-mono">⏎ send · /help</span>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

function Chip({ icon: Icon, label, tone }: { icon: any; label: string; tone: "primary" | "ok" | "err" | "muted" }) {
  const cls = {
    primary: "border-primary/30 bg-primary/10 text-primary",
    ok: "border-green-500/30 bg-green-500/10 text-green-400",
    err: "border-destructive/30 bg-destructive/10 text-destructive",
    muted: "border-border bg-secondary/40 text-muted-foreground",
  }[tone];
  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-mono whitespace-nowrap ${cls}`}>
      <Icon className="h-2.5 w-2.5" />
      <span className="truncate max-w-[140px]">{label}</span>
    </div>
  );
}

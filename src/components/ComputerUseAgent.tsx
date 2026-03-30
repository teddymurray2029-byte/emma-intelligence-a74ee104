import { useState, useCallback, useRef, useEffect } from "react";
import {
  Play, Square, Send, Monitor, Camera, Loader2, AlertCircle, CheckCircle2,
  Eye, MousePointer, RotateCcw, Timer, Shield, ShieldAlert, ExternalLink,
  Keyboard, Globe, Wifi, WifiOff, Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const BOOT_TIMEOUT_SECONDS = 90;
const CU_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-computer-use`;

// Actions that require HITL approval before execution
const SENSITIVE_ACTIONS = new Set(["open_url", "type", "hotkey"]);
const HIGH_RISK_PATTERNS = [
  /password/i, /credit.?card/i, /ssn/i, /social.?security/i,
  /bank/i, /payment/i, /login/i, /sign.?in/i, /credential/i,
  /sudo/i, /rm\s+-rf/i, /delete/i, /format/i,
];

interface AgentStep {
  id: number;
  action: string;
  reasoning: string;
  screenshot?: string;
  timestamp: string;
  status: "pending" | "executing" | "done" | "error" | "awaiting_approval";
  riskLevel?: "low" | "medium" | "high";
  params?: any;
}

type CuApiErrorPayload = {
  error?: string;
  message?: string;
  status?: string;
  stage?: string;
  errorCode?: string;
};

class CuApiError extends Error {
  status: number;
  payload?: CuApiErrorPayload;
  constructor(message: string, status: number, payload?: CuApiErrorPayload) {
    super(message);
    this.name = "CuApiError";
    this.status = status;
    this.payload = payload;
  }
}

interface ComputerUseAgentProps {
  getToken: () => Promise<string | null>;
}

async function cuApi(action: string, params: Record<string, any>, getToken: () => Promise<string | null>, timeoutMs = 30_000) {
  const token = await getToken();
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let resp: Response;
    try {
      resp = await fetch(CU_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, ...params }),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name === "AbortError") throw new Error("Request timed out");
      throw new Error("Failed to reach the computer-use backend");
    }
    const data = await resp.json().catch(() => ({ error: `Request failed [${resp.status}]` }));
    if (!resp.ok) {
      const payload = data as CuApiErrorPayload;
      const stage = payload.stage ? ` (${payload.stage.replace(/\n/g, ", ")})` : "";
      const message = payload.error || payload.message || `Error ${resp.status}`;
      throw new CuApiError(`${message}${stage}`, resp.status, payload);
    }
    return data;
  } catch (e: any) {
    if (e instanceof CuApiError) throw e;
    if (e.name === "AbortError") throw new Error("Request timed out");
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

function formatBootFailure(error: unknown) {
  if (error instanceof CuApiError) {
    const code = error.payload?.errorCode;
    if (code === "black_screen") return "Desktop stayed black during startup";
    if (code === "window_manager_not_ready") return "Desktop session failed to start";
    if (code === "display_not_ready") return "Virtual display did not come up";
    return error.message;
  }
  return error instanceof Error ? error.message : "Desktop boot failed";
}

function assessRisk(action: string, params: any, reasoning: string): "low" | "medium" | "high" {
  const combined = `${action} ${JSON.stringify(params || {})} ${reasoning}`;
  if (HIGH_RISK_PATTERNS.some(p => p.test(combined))) return "high";
  if (SENSITIVE_ACTIONS.has(action)) return "medium";
  return "low";
}

function isMeaningfulScreenshot(base64: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 48;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(true); return; }
      ctx.drawImage(img, 0, 0, 64, 48);
      const { data } = ctx.getImageData(0, 0, 64, 48);
      let bright = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] + data[i + 1] + data[i + 2]) / 3 > 40) bright++;
      }
      resolve(bright / (data.length / 4) > 0.03);
    };
    img.onerror = () => resolve(false);
    img.src = `data:image/png;base64,${base64}`;
  });
}

export function ComputerUseAgent({ getToken }: ComputerUseAgentProps) {
  const [task, setTask] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [envdToken, setEnvdToken] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [intervention, setIntervention] = useState("");
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "running" | "stopping" | "done" | "error">("idle");
  const [bootElapsed, setBootElapsed] = useState(0);
  const [isBooting, setIsBooting] = useState(false);
  const [viewMode, setViewMode] = useState<"live" | "screenshot">("live");

  // HITL state
  const [pendingApproval, setPendingApproval] = useState<{
    stepId: number;
    action: string;
    params: any;
    reasoning: string;
    riskLevel: "low" | "medium" | "high";
  } | null>(null);
  const approvalResolverRef = useRef<((approved: boolean) => void) | null>(null);

  const abortRef = useRef(false);
  const stepIdRef = useRef(0);
  const stepsRef = useRef<AgentStep[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<{ sid: string; token: string } | null>(null);
  const bootTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [steps]);

  useEffect(() => {
    const cleanup = () => {
      const session = sessionRef.current;
      if (session) {
        const payload = JSON.stringify({ action: "stop_session", sessionId: session.sid, envdAccessToken: session.token });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(CU_URL, new Blob([payload], { type: "application/json" }));
        } else {
          fetch(CU_URL, { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
        }
        sessionRef.current = null;
      }
    };
    window.addEventListener("beforeunload", cleanup);
    return () => { window.removeEventListener("beforeunload", cleanup); cleanup(); };
  }, []);

  useEffect(() => {
    if (isBooting) {
      setBootElapsed(0);
      bootTimerRef.current = setInterval(() => setBootElapsed((p) => Math.min(p + 1, BOOT_TIMEOUT_SECONDS)), 1000);
    } else {
      if (bootTimerRef.current) { clearInterval(bootTimerRef.current); bootTimerRef.current = null; }
    }
    return () => { if (bootTimerRef.current) clearInterval(bootTimerRef.current); };
  }, [isBooting]);

  const addStep = useCallback((step: Omit<AgentStep, "id" | "timestamp">) => {
    const newStep: AgentStep = { ...step, id: ++stepIdRef.current, timestamp: new Date().toISOString() };
    stepsRef.current = [...stepsRef.current, newStep];
    setSteps([...stepsRef.current]);
    return newStep.id;
  }, []);

  const updateStep = useCallback((id: number, updates: Partial<AgentStep>) => {
    stepsRef.current = stepsRef.current.map((s) => (s.id === id ? { ...s, ...updates } : s));
    setSteps([...stepsRef.current]);
  }, []);

  // HITL: wait for user approval
  const waitForApproval = (stepId: number, action: string, params: any, reasoning: string, riskLevel: "low" | "medium" | "high"): Promise<boolean> => {
    return new Promise((resolve) => {
      approvalResolverRef.current = resolve;
      setPendingApproval({ stepId, action, params, reasoning, riskLevel });
    });
  };

  const handleApproval = (approved: boolean) => {
    if (approvalResolverRef.current) {
      approvalResolverRef.current(approved);
      approvalResolverRef.current = null;
    }
    if (pendingApproval) {
      updateStep(pendingApproval.stepId, {
        status: approved ? "executing" : "error",
        reasoning: approved
          ? `✅ Approved: ${pendingApproval.reasoning}`
          : `🚫 Rejected by user`,
      });
    }
    setPendingApproval(null);
  };

  const getVncUrl = () => {
    if (!sessionId) return null;
    return `https://6080-${sessionId}.e2b.app`;
  };

  const startSession = useCallback(async () => {
    if (!task.trim()) { toast.error("Enter a task first"); return; }
    setStatus("starting");
    setSummary(null);
    setSteps([]);
    stepsRef.current = [];
    stepIdRef.current = 0;
    abortRef.current = false;
    setPendingApproval(null);

    const startStepId = addStep({ action: "create_sandbox", reasoning: "Creating isolated OS environment...", status: "executing" });

    let sid: string;
    let token: string;

    try {
      const res = await cuApi("start_session", { task: task.trim() }, getToken, 20_000);
      sid = res.sessionId;
      token = res.envdAccessToken;
      setSessionId(sid);
      setEnvdToken(token);
      sessionRef.current = { sid, token };
      updateStep(startStepId, { status: "done", reasoning: `Sandbox created (${sid.slice(0, 8)}...)` });
    } catch (e: any) {
      updateStep(startStepId, { status: "error", reasoning: e.message || "Failed to create sandbox" });
      setStatus("error");
      toast.error(e.message || "Failed to start session");
      return;
    }

    if (abortRef.current) return;

    setStatus("running");
    setIsRunning(true);
    setIsBooting(true);
    const waitStepId = addStep({ action: "boot_desktop", reasoning: "Starting virtual desktop (Xvfb + XFCE)...", status: "executing" });

    try {
      const readiness = await cuApi("wait_until_ready", { sessionId: sid, envdAccessToken: token }, getToken, 120_000);
      if (readiness.ready && readiness.screenshot) {
        await isMeaningfulScreenshot(readiness.screenshot);
        setCurrentScreenshot(readiness.screenshot);
        updateStep(waitStepId, { status: "done", screenshot: readiness.screenshot, reasoning: `Desktop ready (${Math.ceil(readiness.waitedMs / 1000)}s)` });
      } else {
        throw new Error(readiness.error || "Desktop did not become ready");
      }
    } catch (e: any) {
      updateStep(waitStepId, { status: "error", reasoning: `Boot failed: ${formatBootFailure(e)}` });
      setIsRunning(false);
      setIsBooting(false);
      setStatus("error");
      toast.error(`Desktop boot failed: ${formatBootFailure(e)}`);
      return;
    }

    setIsBooting(false);
    if (abortRef.current) return;
    await runAgentLoop(sid, task.trim(), token);
  }, [task, getToken, addStep, updateStep]);

  const runAgentLoop = async (sid: string, taskDesc: string, token: string) => {
    const actionHistory: { action: string; reasoning: string }[] = [];
    const MAX_STEPS = 50;

    for (let i = 0; i < MAX_STEPS; i++) {
      if (abortRef.current) {
        addStep({ action: "stopped", reasoning: "Task stopped by user", status: "done" });
        break;
      }

      const thinkStepId = addStep({ action: "thinking", reasoning: "Analyzing screen...", status: "executing" });

      try {
        const pendingIntervention = intervention;
        if (pendingIntervention) setIntervention("");

        const decision = await cuApi("think", {
          sessionId: sid, task: taskDesc, actionHistory,
          userMessage: pendingIntervention || undefined,
          envdAccessToken: token,
        }, getToken, 60_000);

        if (decision.screenshot) {
          setCurrentScreenshot(decision.screenshot);
          updateStep(thinkStepId, { screenshot: decision.screenshot });
        }

        updateStep(thinkStepId, {
          status: decision.status === "black_screen" ? "executing" : "done",
          reasoning: decision.reasoning,
          action: `think → ${decision.action}`,
        });

        actionHistory.push({ action: decision.action, reasoning: decision.reasoning });

        if (decision.done) {
          setSummary(decision.summary || "Task completed.");
          setStatus("done");
          setIsRunning(false);
          addStep({ action: "complete", reasoning: decision.summary || "Task completed successfully!", status: "done" });
          break;
        }

        if (decision.action !== "wait") {
          const riskLevel = assessRisk(decision.action, decision.params, decision.reasoning);

          // HITL checkpoint: pause for approval on medium/high risk actions
          if (riskLevel !== "low") {
            const approvalStepId = addStep({
              action: `approve: ${decision.action}`,
              reasoning: `⏸ Awaiting approval — ${decision.reasoning}`,
              status: "awaiting_approval",
              riskLevel,
              params: decision.params,
            });

            const approved = await waitForApproval(approvalStepId, decision.action, decision.params, decision.reasoning, riskLevel);

            if (!approved) {
              addStep({ action: "skipped", reasoning: "Action rejected by user, finding alternative...", status: "done" });
              actionHistory.push({ action: "skipped", reasoning: "User rejected this action" });
              continue;
            }
          }

          const execStepId = addStep({ action: decision.action, reasoning: `Executing: ${decision.action}`, status: "executing" });
          try {
            const execResult = await cuApi("execute", {
              sessionId: sid, actionType: decision.action,
              params: decision.params, envdAccessToken: token,
            }, getToken, 30_000);
            updateStep(execStepId, { status: "done", reasoning: `${decision.action} executed` });
            if (execResult?.screenshot) {
              setCurrentScreenshot(execResult.screenshot);
              updateStep(execStepId, { screenshot: execResult.screenshot });
            }
          } catch (e: any) {
            updateStep(execStepId, { status: "error", reasoning: `Action failed: ${e.message}` });
          }
        }

        const waitTime = decision.action === "wait" ? (decision.params?.seconds || 2) * 1000 : 1500;
        await new Promise((r) => setTimeout(r, waitTime));
      } catch (e: any) {
        updateStep(thinkStepId, { status: "error", reasoning: `Error: ${e.message}` });
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    if (!abortRef.current && stepsRef.current.length >= MAX_STEPS) {
      setSummary("Reached maximum step limit.");
      setStatus("done");
      setIsRunning(false);
    }
  };

  const stopSession = useCallback(async () => {
    abortRef.current = true;
    setStatus("stopping");
    // Reject any pending approval
    if (approvalResolverRef.current) {
      approvalResolverRef.current(false);
      approvalResolverRef.current = null;
      setPendingApproval(null);
    }
    if (sessionId) {
      try { await cuApi("stop_session", { sessionId, envdAccessToken: envdToken }, getToken, 10_000); } catch {}
    }
    setIsRunning(false);
    setSessionId(null);
    setEnvdToken(null);
    sessionRef.current = null;
    setIsBooting(false);
    setStatus("done");
    toast.success("Agent stopped");
  }, [sessionId, envdToken, getToken]);

  const handleIntervene = () => {
    if (!intervention.trim()) return;
    addStep({ action: "user_message", reasoning: `User: ${intervention.trim()}`, status: "done" });
  };

  const resetToIdle = () => {
    setStatus("idle");
    setSteps([]);
    setSummary(null);
    setCurrentScreenshot(null);
    sessionRef.current = null;
    setPendingApproval(null);
  };

  const getStatusIcon = (s: AgentStep["status"]) => {
    switch (s) {
      case "executing": return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
      case "done": return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case "error": return <AlertCircle className="h-3 w-3 text-destructive" />;
      case "awaiting_approval": return <ShieldAlert className="h-3 w-3 text-yellow-500 animate-pulse" />;
      default: return <div className="h-3 w-3 rounded-full bg-muted" />;
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes("think")) return <Eye className="h-3 w-3" />;
    if (action.includes("click") || action.includes("mouse")) return <MousePointer className="h-3 w-3" />;
    if (action === "screenshot") return <Camera className="h-3 w-3" />;
    if (action.includes("type")) return <Keyboard className="h-3 w-3" />;
    if (action.includes("open_url")) return <Globe className="h-3 w-3" />;
    if (action.includes("approve")) return <Shield className="h-3 w-3" />;
    if (action.includes("sandbox") || action.includes("boot")) return <Monitor className="h-3 w-3" />;
    return <div className="h-3 w-3" />;
  };

  const getRiskBadge = (level?: "low" | "medium" | "high") => {
    if (!level || level === "low") return null;
    return (
      <Badge variant={level === "high" ? "destructive" : "secondary"} className="text-[8px] h-4 px-1">
        {level === "high" ? "⚠ HIGH RISK" : "REVIEW"}
      </Badge>
    );
  };

  const vncUrl = getVncUrl();

  const renderDesktopView = () => {
    // Live VNC stream via iframe
    if (viewMode === "live" && vncUrl && (isRunning || status === "done")) {
      return (
        <iframe
          src={vncUrl}
          className="w-full h-full border-0"
          title="Live Desktop Stream"
          sandbox="allow-scripts allow-same-origin"
          allow="clipboard-read; clipboard-write"
        />
      );
    }

    // Fallback: static screenshot
    if (currentScreenshot) {
      return (
        <img
          src={`data:image/png;base64,${currentScreenshot}`}
          alt="Desktop screenshot"
          className="w-full h-full object-contain"
        />
      );
    }

    return (
      <div className="text-center space-y-3">
        <Monitor className="h-12 w-12 text-muted-foreground mx-auto" />
        <p className="text-xs text-muted-foreground">
          {status === "starting" ? "Creating sandbox..." : status === "running" ? "Booting virtual desktop..." : "Desktop view will appear here"}
        </p>
        {(status === "starting" || (status === "running" && !currentScreenshot)) && <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />}
        {isBooting && (
          <div className="w-48 mt-3 space-y-1.5">
            <Progress value={(bootElapsed / BOOT_TIMEOUT_SECONDS) * 100} className="h-1.5" />
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <Timer className="h-3 w-3" />
              <span>{bootElapsed}s / {BOOT_TIMEOUT_SECONDS}s</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Task Input Bar */}
      {(status === "idle" || status === "done" || status === "error") && (
        <div className="p-4 border-b border-border bg-card space-y-3 flex-shrink-0">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" />
              Computer-Use Agent
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Spins up an isolated virtual desktop. HITL checkpoints pause for your approval on sensitive actions.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder='e.g. "Research the top 3 AI coding tools and compare them"'
              className="text-xs"
              onKeyDown={(e) => { if (e.key === "Enter") startSession(); }}
            />
            <Button onClick={startSession} size="sm" className="gap-1.5 px-4">
              <Play className="h-3.5 w-3.5" /> Start
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Research AI tools and make a comparison table",
              "Post a thread on X/Twitter",
              "Search for trending GitHub repos in AI",
            ].map((ex) => (
              <button
                key={ex}
                onClick={() => setTask(ex)}
                className="text-[9px] px-2 py-1 rounded-md bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* HITL Approval Banner */}
      {pendingApproval && (
        <div className={`px-4 py-3 border-b flex-shrink-0 ${pendingApproval.riskLevel === "high" ? "bg-destructive/10 border-destructive/30" : "bg-yellow-500/10 border-yellow-500/30"}`}>
          <div className="flex items-start gap-3">
            <ShieldAlert className={`h-5 w-5 flex-shrink-0 mt-0.5 ${pendingApproval.riskLevel === "high" ? "text-destructive" : "text-yellow-500"}`} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Action Requires Approval</span>
                {getRiskBadge(pendingApproval.riskLevel)}
              </div>
              <p className="text-[11px] text-foreground">{pendingApproval.reasoning}</p>
              <div className="text-[10px] font-mono text-muted-foreground bg-secondary/50 rounded px-2 py-1 inline-block">
                {pendingApproval.action}: {JSON.stringify(pendingApproval.params)}
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleApproval(true)}>
                  <CheckCircle2 className="h-3 w-3" /> Approve
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={() => handleApproval(false)}>
                  <Square className="h-3 w-3" /> Reject
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {status !== "idle" && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={60} minSize={30}>
              <div className="flex flex-col h-full">
                {/* Desktop toolbar */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isRunning ? "bg-green-500 animate-pulse" : status === "error" ? "bg-destructive" : "bg-muted-foreground"}`} />
                    <span className="text-[10px] font-mono text-foreground capitalize">{status}</span>
                    {sessionId && <span className="text-[9px] font-mono text-muted-foreground">{sessionId.slice(0, 12)}…</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* View mode toggle */}
                    <Button
                      variant={viewMode === "live" ? "default" : "ghost"}
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={() => setViewMode("live")}
                      title="Live VNC stream"
                    >
                      {viewMode === "live" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                      Live
                    </Button>
                    <Button
                      variant={viewMode === "screenshot" ? "default" : "ghost"}
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={() => setViewMode("screenshot")}
                      title="Screenshot mode"
                    >
                      <ImageIcon className="h-3 w-3" />
                      Screenshot
                    </Button>

                    {vncUrl && (
                      <Button variant="ghost" size="sm" className="h-6 px-1.5" asChild title="Open in new tab">
                        <a href={vncUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /></a>
                      </Button>
                    )}

                    {status === "error" && (
                      <Button variant="secondary" size="sm" className="h-6 gap-1 text-[10px]" onClick={startSession}>
                        <RotateCcw className="h-3 w-3" /> Retry
                      </Button>
                    )}
                    {isRunning && (
                      <Button variant="destructive" size="sm" className="h-6 gap-1 text-[10px]" onClick={stopSession}>
                        <Square className="h-3 w-3" /> Stop
                      </Button>
                    )}
                  </div>
                </div>

                {/* Desktop view */}
                <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden min-h-0">
                  {renderDesktopView()}
                </div>

                {/* Intervention input */}
                {isRunning && (
                  <div className="px-3 py-1.5 border-t border-border bg-card flex-shrink-0">
                    <div className="flex gap-2">
                      <Input
                        value={intervention}
                        onChange={(e) => setIntervention(e.target.value)}
                        placeholder="Intervene: tell Emma to change approach..."
                        className="text-xs h-7"
                        onKeyDown={(e) => { if (e.key === "Enter") handleIntervene(); }}
                      />
                      <Button size="sm" variant="secondary" className="h-7 px-2" onClick={handleIntervene}>
                        <Send className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Agent Reasoning Panel */}
            <ResizablePanel defaultSize={40} minSize={20}>
              <div className="flex flex-col h-full bg-card overflow-hidden">
                <div className="px-3 py-1.5 border-b border-border flex-shrink-0 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Agent Reasoning</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{steps.length} steps</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3 w-3 text-green-500" />
                    <span className="text-[9px] text-muted-foreground">HITL Active</span>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto" ref={scrollRef}>
                  <div className="p-2 space-y-1">
                    {steps.map((step) => (
                      <div
                        key={step.id}
                        className={`flex gap-2 p-2 rounded-lg transition-colors group ${
                          step.status === "awaiting_approval"
                            ? "bg-yellow-500/10 border border-yellow-500/30"
                            : "hover:bg-secondary/30"
                        }`}
                      >
                        <div className="flex-shrink-0 mt-0.5">{getStatusIcon(step.status)}</div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getActionIcon(step.action)}
                            <span className="text-[10px] font-mono text-primary uppercase">{step.action}</span>
                            {getRiskBadge(step.riskLevel)}
                            <span className="text-[9px] text-muted-foreground ml-auto">
                              {new Date(step.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-[11px] text-foreground leading-relaxed">{step.reasoning}</p>
                          {step.screenshot && (
                            <img
                              src={`data:image/png;base64,${step.screenshot}`}
                              alt="Step screenshot"
                              className="w-full rounded border border-border mt-1 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => { setCurrentScreenshot(step.screenshot!); setViewMode("screenshot"); }}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                    {steps.length === 0 && (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        Agent actions will appear here as Emma works...
                      </div>
                    )}
                  </div>
                </div>

                {summary && (
                  <div className="p-3 border-t border-border bg-primary/5 flex-shrink-0">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Task Summary</p>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{summary}</p>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" className="w-full mt-2 text-xs" onClick={resetToIdle}>
                      New Task
                    </Button>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  );
}

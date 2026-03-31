import { useState, useCallback, useRef, useEffect } from "react";
import {
  Play, Square, Send, Monitor, Camera, Loader2, AlertCircle, CheckCircle2,
  Eye, MousePointer, RotateCcw, Timer,
  Keyboard, Globe, FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Progress } from "@/components/ui/progress";

const BOOT_TIMEOUT_SECONDS = 90;
const CU_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-computer-use`;

interface AgentStep {
  id: number;
  action: string;
  reasoning: string;
  screenshot?: string;
  timestamp: string;
  status: "pending" | "executing" | "done" | "error";
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

  const abortRef = useRef(false);
  const stepIdRef = useRef(0);
  const stepsRef = useRef<AgentStep[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<{ sid: string; token: string } | null>(null);
  const bootTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskRef = useRef("");

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

  const refreshLatestScreenshot = useCallback(async (sid: string, token: string, stepId?: number) => {
    try {
      const latest = await cuApi("screenshot", { sessionId: sid, envdAccessToken: token }, getToken, 20_000);
      if (latest?.screenshot) {
        setCurrentScreenshot(latest.screenshot);
        if (stepId) updateStep(stepId, { screenshot: latest.screenshot });
        return latest.screenshot as string;
      }
    } catch {
      // Best-effort refresh only.
    }
    return null;
  }, [getToken, updateStep]);

  const stopKeepalive = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  }, []);

  const startKeepalive = useCallback((sid: string, token: string) => {
    stopKeepalive();
    keepaliveRef.current = setInterval(async () => {
      const session = sessionRef.current;
      if (!session) return;
      try {
        const res = await cuApi("keepalive", {
          sessionId: session.sid,
          envdAccessToken: session.token,
          task: taskRef.current,
        }, getToken, 15_000);
        if (res.status === "recreated" && res.sessionId && res.envdAccessToken) {
          // Sandbox was recreated — update all refs
          console.log(`[keepalive] Sandbox recreated: ${res.sessionId}`);
          setSessionId(res.sessionId);
          setEnvdToken(res.envdAccessToken);
          sessionRef.current = { sid: res.sessionId, token: res.envdAccessToken };
        }
      } catch (e) {
        console.warn("[keepalive] ping failed:", e);
      }
    }, 60_000);
  }, [getToken, stopKeepalive]);

  const startSession = useCallback(async () => {
    if (!task.trim()) { toast.error("Enter a task first"); return; }
    setStatus("starting");
    setSummary(null);
    setSteps([]);
    stepsRef.current = [];
    stepIdRef.current = 0;
    abortRef.current = false;
    taskRef.current = task.trim();

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

    // Start keepalive heartbeat
    startKeepalive(sid, token);

    await runAgentLoop(sid, task.trim(), token);
  }, [task, getToken, addStep, updateStep, startKeepalive]);

  const runAgentLoop = async (sid: string, taskDesc: string, token: string) => {
    const actionHistory: { action: string; reasoning: string }[] = [];

    while (true) {
      if (abortRef.current) {
        addStep({ action: "stopped", reasoning: "Task stopped by user", status: "done" });
        break;
      }

      // Always use latest session credentials (keepalive may have swapped them)
      const currentSession = sessionRef.current;
      const curSid = currentSession?.sid || sid;
      const curToken = currentSession?.token || token;

      const thinkStepId = addStep({ action: "thinking", reasoning: "Analyzing screen...", status: "executing" });

      try {
        const pendingIntervention = intervention;
        if (pendingIntervention) setIntervention("");

        const decision = await cuApi("think", {
          sessionId: curSid, task: taskDesc, actionHistory,
          userMessage: pendingIntervention || undefined,
          envdAccessToken: curToken,
        }, getToken, 60_000);

        // If sandbox_expired, wait for keepalive to recover
        if (decision.errorCode === "sandbox_expired") {
          updateStep(thinkStepId, { status: "executing", reasoning: "Sandbox expired — auto-recovering..." });
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

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
          await refreshLatestScreenshot(curSid, curToken, thinkStepId);
          setSummary(decision.summary || "Task completed.");
          setStatus("done");
          setIsRunning(false);
          stopKeepalive();
          addStep({ action: "complete", reasoning: decision.summary || "Task completed successfully!", status: "done" });
          break;
        }

        let latestStepId: number | undefined;

        if (decision.action !== "wait") {
          const execStepId = addStep({ action: decision.action, reasoning: `Executing: ${decision.action}`, status: "executing" });
          latestStepId = execStepId;
          try {
            const execResult = await cuApi("execute", {
              sessionId: curSid, actionType: decision.action,
              params: decision.params, envdAccessToken: curToken,
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
        await refreshLatestScreenshot(curSid, curToken, latestStepId ?? thinkStepId);
      } catch (e: any) {
        updateStep(thinkStepId, { status: "error", reasoning: `Error: ${e.message}` });
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };

  const stopSession = useCallback(async () => {
    abortRef.current = true;
    setStatus("stopping");
    stopKeepalive();
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
  }, [sessionId, envdToken, getToken, stopKeepalive]);

  const handleIntervene = () => {
    if (!intervention.trim()) return;
    addStep({ action: "user_message", reasoning: `User: ${intervention.trim()}`, status: "done" });
  };

  const resetToIdle = () => {
    setStatus("idle");
    setSteps([]);
    setSummary(null);
    setCurrentScreenshot(null);
  };

  const downloadBugBountyReport = useCallback(() => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString();

    // Convert basic markdown to HTML
    const mdToHtml = (text: string) => {
      if (!text) return "";
      return text
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        // Headers
        .replace(/^### (.+)$/gm, '<h4 style="font-size:13px;font-weight:700;margin:16px 0 6px;color:#1a202c;">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;margin:20px 0 8px;color:#1a202c;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 style="font-size:17px;font-weight:700;margin:24px 0 10px;color:#0f172a;">$1</h2>')
        // Bold & italic
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:11px;font-family:monospace;color:#be185d;">$1</code>')
        // Code blocks
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_m: string, _lang: string, code: string) =>
          `<pre style="background:#1e293b;color:#e2e8f0;padding:12px 16px;border-radius:6px;font-size:11px;line-height:1.5;overflow-x:auto;margin:10px 0;font-family:'JetBrains Mono',monospace;white-space:pre-wrap;word-break:break-all;">${code.trim()}</pre>`)
        // Bullet lists
        .replace(/^- (.+)$/gm, '<li style="margin:3px 0;padding-left:4px;">$1</li>')
        .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match: string) => `<ul style="margin:8px 0 8px 20px;padding:0;list-style:disc;">${match}</ul>`)
        // Numbered lists
        .replace(/^\d+\. (.+)$/gm, '<li style="margin:3px 0;padding-left:4px;">$1</li>')
        // Paragraphs (double newline)
        .replace(/\n\n/g, '</p><p style="margin:8px 0;line-height:1.7;">')
        // Single newlines inside text
        .replace(/\n/g, '<br/>');
      
    };

    const stepsHtml = stepsRef.current
      .map((s, i) => {
        const statusColor = s.status === "done" ? "#16a34a" : s.status === "error" ? "#dc2626" : "#a3a3a3";
        const statusLabel = s.status === "done" ? "✅ Completed" : s.status === "error" ? "❌ Error" : "⏳ Pending";
        const screenshotHtml = s.screenshot
          ? `<div style="margin-top:10px;"><img src="data:image/png;base64,${s.screenshot}" style="max-width:100%;border:1px solid #e2e8f0;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.1);" /></div>`
          : "";
        return `
          <div style="margin-bottom:20px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:8px;page-break-inside:avoid;background:#fff;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:13px;font-weight:700;color:#0f172a;">Step ${i + 1}</span>
              <span style="font-size:10px;color:${statusColor};font-weight:600;">${statusLabel}</span>
            </div>
            <div style="font-size:10px;color:#94a3b8;margin-bottom:8px;font-family:monospace;">${new Date(s.timestamp).toLocaleString()}</div>
            <div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:6px;padding:6px 10px;background:#f8fafc;border-radius:4px;border-left:3px solid #3b82f6;">
              ${s.action}
            </div>
            <div style="font-size:11px;color:#475569;line-height:1.6;padding:4px 0;">
              ${mdToHtml(s.reasoning)}
            </div>
            ${screenshotHtml}
          </div>`;
      })
      .join("");

    const errorSteps = stepsRef.current.filter((s) => s.status === "error");
    const findingsHtml = errorSteps.length
      ? errorSteps
          .map(
            (s, i) =>
              `<div style="margin-bottom:12px;padding:12px 16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;">
                <div style="font-size:12px;font-weight:700;color:#991b1b;margin-bottom:4px;">Finding ${i + 1}</div>
                <div style="font-size:11px;color:#7f1d1d;line-height:1.6;">${mdToHtml(s.reasoning)}</div>
              </div>`
          )
          .join("")
      : '<p style="color:#94a3b8;font-style:italic;font-size:12px;">No errors or anomalies detected during this run.</p>';

    const totalDuration = stepsRef.current.length > 0
      ? Math.round((new Date(stepsRef.current[stepsRef.current.length - 1].timestamp).getTime() - new Date(stepsRef.current[0].timestamp).getTime()) / 1000)
      : 0;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Bug Bounty Report — ${dateStr}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 48px 56px;
    color: #334155;
    max-width: 860px;
    margin: auto;
    line-height: 1.6;
    font-size: 12px;
  }
  h1 { font-size: 24px; color: #0f172a; margin-bottom: 4px; letter-spacing: -0.5px; }
  h2 { font-size: 16px; color: #0f172a; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
  .meta { font-size: 11px; color: #94a3b8; margin-bottom: 24px; line-height: 1.8; }
  .meta span { display: inline-block; margin-right: 20px; }
  .summary-box {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 20px;
    font-size: 12px;
    line-height: 1.7;
    color: #1e40af;
  }
  .stats {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
  }
  .stat-card {
    flex: 1;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 16px;
    text-align: center;
  }
  .stat-card .value { font-size: 20px; font-weight: 700; color: #0f172a; }
  .stat-card .label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    font-size: 10px;
    color: #cbd5e1;
    text-align: center;
  }
  @media print {
    body { padding: 24px 32px; }
    .stat-card { break-inside: avoid; }
  }
</style></head><body>

<h1>🛡️ Bug Bounty Agent Report</h1>
<div class="meta">
  <span><strong>Date:</strong> ${dateStr} at ${timeStr}</span>
  <span><strong>Task:</strong> ${taskRef.current || "N/A"}</span>
</div>

<div class="stats">
  <div class="stat-card">
    <div class="value">${stepsRef.current.length}</div>
    <div class="label">Total Steps</div>
  </div>
  <div class="stat-card">
    <div class="value">${errorSteps.length}</div>
    <div class="label">Findings</div>
  </div>
  <div class="stat-card">
    <div class="value">${totalDuration}s</div>
    <div class="label">Duration</div>
  </div>
  <div class="stat-card">
    <div class="value">${stepsRef.current.filter(s => s.status === "done").length}</div>
    <div class="label">Completed</div>
  </div>
</div>

<h2>Executive Summary</h2>
<div class="summary-box">${mdToHtml(summary || "No summary available.")}</div>

<h2>Findings &amp; Anomalies</h2>
${findingsHtml}

<h2>Detailed Agent Steps</h2>
${stepsHtml}

<div class="footer">
  Emma Computer-Use Agent · Bug Bounty Report · Generated ${dateStr} at ${timeStr}
</div>

</body></html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    } else {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bug-bounty-report-${dateStr}.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast.info("Report downloaded as HTML — open and print to PDF");
    }
  }, [summary]);

  const getStatusIcon = (s: AgentStep["status"]) => {
    switch (s) {
      case "executing": return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
      case "done": return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case "error": return <AlertCircle className="h-3 w-3 text-destructive" />;
      default: return <div className="h-3 w-3 rounded-full bg-muted" />;
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes("think")) return <Eye className="h-3 w-3" />;
    if (action.includes("click") || action.includes("mouse")) return <MousePointer className="h-3 w-3" />;
    if (action === "screenshot") return <Camera className="h-3 w-3" />;
    if (action.includes("type")) return <Keyboard className="h-3 w-3" />;
    if (action.includes("open_url")) return <Globe className="h-3 w-3" />;
    if (action.includes("sandbox") || action.includes("boot")) return <Monitor className="h-3 w-3" />;
    return <div className="h-3 w-3" />;
  };

  const renderDesktopView = () => {
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
              Spins up an isolated virtual desktop and autonomously completes tasks end-to-end.
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

      {/* Main Content */}
      {status !== "idle" && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
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
            <ResizablePanel defaultSize={40} minSize={20} className="overflow-hidden">
              <div className="flex flex-col h-full bg-card">
                <div className="px-3 py-1.5 border-b border-border flex-shrink-0">
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Agent Reasoning</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{steps.length} steps</span>
                </div>
                <div className="h-[500px] overflow-y-scroll" ref={scrollRef}>
                  <div className="p-2 space-y-1">
                    {steps.map((step) => (
                      <div
                        key={step.id}
                        className="flex gap-2 p-2 rounded-lg transition-colors group hover:bg-secondary/30"
                      >
                        <div className="flex-shrink-0 mt-0.5">{getStatusIcon(step.status)}</div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getActionIcon(step.action)}
                            <span className="text-[10px] font-mono text-primary uppercase">{step.action}</span>
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
                              onClick={() => setCurrentScreenshot(step.screenshot!)}
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
                    <div className="flex gap-2 mt-2">
                      <Button variant="secondary" size="sm" className="flex-1 text-xs gap-1.5" onClick={downloadBugBountyReport}>
                        <FileDown className="h-3 w-3" /> Download Report
                      </Button>
                      <Button variant="secondary" size="sm" className="flex-1 text-xs" onClick={resetToIdle}>
                        New Task
                      </Button>
                    </div>
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

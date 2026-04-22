import { useState, useCallback, useRef, useEffect } from "react";
import {
  Play, Square, Send, Monitor, Camera, Loader2, AlertCircle, CheckCircle2,
  Eye, MousePointer, RotateCcw, Timer,
  Keyboard, Globe, FileDown, Shield, ShieldAlert, ShieldCheck, Bug, FileJson, FileText, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Progress } from "@/components/ui/progress";
import { scoreFromVector, severityFromScore, SEVERITY_COLORS, type Severity } from "@/lib/cvss";
import { parseScopeList, isUrlInScope } from "@/lib/scope";
import { findingsToMarkdown, findingsToJson, downloadBlob, type FindingExport, type EngagementExport } from "@/lib/report-export";

const BOOT_TIMEOUT_SECONDS = 90;
const CU_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-computer-use`;

interface AgentStep {
  id: number;
  action: string;
  reasoning: string;
  screenshot?: string;
  timestamp: string;
  status: "pending" | "executing" | "done" | "error" | "blocked";
  params?: any;
  guardrail?: string;
}

type EngagementType = "bug_bounty" | "pentest" | "ctf" | "personal";
type IntensityLevel = "passive" | "active" | "exploitation";

interface Engagement {
  name: string;
  type: EngagementType;
  inScope: string[];
  outOfScope: string[];
  intensity: IntensityLevel;
  authorized: boolean;
  allowExploitation: boolean;
  scopeLockEnabled: boolean;
}

interface Finding {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  cvssVector?: string;
  cvssScore?: number;
  affectedUrl?: string;
  description: string;
  reproductionSteps: string[];
  remediation?: string;
  evidenceFrameIndices: number[];
  request?: string;
  response?: string;
  reportedAt: string;
  stepId: number;
}

const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  bug_bounty: "Bug Bounty",
  pentest: "Authorized Pentest",
  ctf: "CTF / Lab",
  personal: "Personal Target",
};

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

  // === Engagement & findings ===
  const [showEngagementForm, setShowEngagementForm] = useState(false);
  const [engagement, setEngagement] = useState<Engagement>({
    name: "",
    type: "bug_bounty",
    inScope: [],
    outOfScope: [],
    intensity: "passive",
    authorized: false,
    allowExploitation: false,
    scopeLockEnabled: true,
  });
  const [scopeText, setScopeText] = useState("");
  const [outScopeText, setOutScopeText] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const findingsRef = useRef<Finding[]>([]);
  const engagementRef = useRef<Engagement>(engagement);
  const engagementStartRef = useRef<string>("");

  useEffect(() => { engagementRef.current = engagement; }, [engagement]);
  useEffect(() => { findingsRef.current = findings; }, [findings]);

  const abortRef = useRef(false);
  const stepIdRef = useRef(0);
  const stepsRef = useRef<AgentStep[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<{ sid: string; token: string } | null>(null);
  const bootTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskRef = useRef("");
  const framesRef = useRef<{ base64: string; t: number; reasoning?: string; action?: string }[]>([]);
  const sandboxResetRef = useRef(false);
  const [isBuildingVideo, setIsBuildingVideo] = useState(false);

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

  const recordFrame = useCallback((base64: string, reasoning?: string, action?: string) => {
    if (!base64) return;
    const last = framesRef.current[framesRef.current.length - 1];
    // Skip duplicate frames (same base64 + same reasoning)
    if (last && last.base64 === base64 && last.reasoning === reasoning) return;
    framesRef.current.push({ base64, t: Date.now(), reasoning: reasoning || "", action: action || "" });
    // Cap frames to prevent runaway memory (max 600 frames ~10min @ 1fps)
    if (framesRef.current.length > 600) framesRef.current.shift();
  }, []);

  const refreshLatestScreenshot = useCallback(async (sid: string, token: string, stepId?: number, reasoning?: string, action?: string) => {
    try {
      const latest = await cuApi("screenshot", { sessionId: sid, envdAccessToken: token }, getToken, 20_000);
      if (latest?.screenshot) {
        setCurrentScreenshot(latest.screenshot);
        recordFrame(latest.screenshot, reasoning, action);
        if (stepId) updateStep(stepId, { screenshot: latest.screenshot });
        return latest.screenshot as string;
      }
    } catch {
      // Best-effort refresh only.
    }
    return null;
  }, [getToken, updateStep, recordFrame]);

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
          // Sandbox was recreated — update all refs and signal loop to discard stale action history
          console.log(`[keepalive] Sandbox recreated: ${res.sessionId}`);
          setSessionId(res.sessionId);
          setEnvdToken(res.envdAccessToken);
          sessionRef.current = { sid: res.sessionId, token: res.envdAccessToken };
          sandboxResetRef.current = true;
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
    framesRef.current = [];
    setFindings([]);
    findingsRef.current = [];
    engagementStartRef.current = new Date().toISOString();

    // Parse scope text into engagement
    const parsedEng: Engagement = {
      ...engagement,
      inScope: parseScopeList(scopeText),
      outOfScope: parseScopeList(outScopeText),
    };
    setEngagement(parsedEng);
    engagementRef.current = parsedEng;

    if (parsedEng.scopeLockEnabled && parsedEng.inScope.length === 0) {
      toast.error("Scope lock is on but no in-scope hosts defined. Add at least one or disable scope lock.");
      setStatus("idle");
      return;
    }
    if (!parsedEng.authorized) {
      toast.error("You must confirm authorization before starting an engagement.");
      setStatus("idle");
      return;
    }

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
        recordFrame(readiness.screenshot, "Desktop ready — agent will start analyzing now.", "boot_desktop");
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

      // If keepalive recreated the sandbox, the desktop is brand new — discard stale action history
      // so the AI reasons purely from the actual current screenshot instead of hallucinating prior progress.
      if (sandboxResetRef.current) {
        sandboxResetRef.current = false;
        actionHistory.length = 0;
        addStep({
          action: "sandbox_recreated",
          reasoning: "Sandbox was recreated by keepalive — desktop reset to fresh state. Restarting task from current visible state.",
          status: "done",
        });
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
          engagement: engagementRef.current,
        }, getToken, 60_000);

        // If sandbox_expired, wait for keepalive to recover
        if (decision.errorCode === "sandbox_expired") {
          updateStep(thinkStepId, { status: "executing", reasoning: "Sandbox expired — auto-recovering..." });
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        if (decision.screenshot) {
          setCurrentScreenshot(decision.screenshot);
          recordFrame(decision.screenshot, decision.reasoning, `think → ${decision.action}`);
          updateStep(thinkStepId, { screenshot: decision.screenshot });
        }

        updateStep(thinkStepId, {
          status: decision.status === "black_screen" ? "executing" : "done",
          reasoning: decision.reasoning,
          action: `think → ${decision.action}`,
        });

        actionHistory.push({ action: decision.action, reasoning: decision.reasoning });

        // === Handle structured finding from AI ===
        if (decision.action === "report_finding" && decision.finding) {
          const f = decision.finding;
          let cvssScore: number | undefined;
          let severity: Severity = (f.severity as Severity) || "Info";
          if (f.cvssVector) {
            const calc = scoreFromVector(f.cvssVector);
            if (calc) { cvssScore = calc.score; severity = calc.severity; }
          }
          const newFinding: Finding = {
            id: `f-${Date.now()}`,
            title: f.title || "Untitled finding",
            severity,
            category: f.category || "Other",
            cvssVector: f.cvssVector,
            cvssScore,
            affectedUrl: f.affectedUrl,
            description: f.description || "",
            reproductionSteps: Array.isArray(f.reproductionSteps) ? f.reproductionSteps : [],
            remediation: f.remediation,
            evidenceFrameIndices: [framesRef.current.length - 1].filter((i) => i >= 0),
            request: f.request,
            response: f.response,
            reportedAt: new Date().toISOString(),
            stepId: thinkStepId,
          };
          findingsRef.current = [...findingsRef.current, newFinding];
          setFindings([...findingsRef.current]);
          addStep({
            action: "🐛 finding",
            reasoning: `[${severity}${cvssScore ? ` · CVSS ${cvssScore}` : ""}] ${newFinding.title} — ${newFinding.description.slice(0, 200)}`,
            status: "done",
          });
          toast.success(`Finding logged: ${newFinding.title} (${severity})`);
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }


        if (decision.done) {
          // IMPORTANT: do NOT refresh the screenshot here — the desktop may have changed
          // (e.g., sandbox keepalive reset, browser closed). The AI's summary describes what
          // it saw in `decision.screenshot`, so attach THAT exact frame to the completion step
          // to keep visual evidence in sync with the reasoning.
          setSummary(decision.summary || "Task completed.");
          setStatus("done");
          setIsRunning(false);
          stopKeepalive();
          if (decision.screenshot) {
            recordFrame(decision.screenshot, decision.summary || "Task completed successfully!", "complete");
          }
          addStep({
            action: "complete",
            reasoning: decision.summary || "Task completed successfully!",
            status: "done",
            screenshot: decision.screenshot,
          });
          break;
        }

        let latestStepId: number | undefined;
        const execReasoning = `${decision.action}: ${decision.reasoning}`;

        if (decision.action !== "wait") {
          // Client-side scope pre-check for open_url
          if (decision.action === "open_url" && engagementRef.current.scopeLockEnabled) {
            const check = isUrlInScope(decision.params?.url || "", {
              inScope: engagementRef.current.inScope,
              outOfScope: engagementRef.current.outOfScope,
            });
            if (!check.allowed) {
              addStep({
                action: "🚫 scope_block",
                reasoning: `Blocked navigation to ${decision.params?.url} — ${check.reason}`,
                status: "blocked",
                guardrail: "scope",
              });
              actionHistory.push({ action: "scope_block", reasoning: `Blocked: ${check.reason}` });
              await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
          }
          const execStepId = addStep({ action: decision.action, reasoning: `Executing: ${decision.action}`, status: "executing" });
          latestStepId = execStepId;
          try {
            const execResult = await cuApi("execute", {
              sessionId: curSid, actionType: decision.action,
              params: decision.params, envdAccessToken: curToken,
              engagement: engagementRef.current,
            }, getToken, 30_000);
            if (execResult?.blocked) {
              updateStep(execStepId, {
                status: "blocked",
                reasoning: `🚫 ${execResult.error}`,
                guardrail: execResult.guardrail,
              });
              actionHistory.push({ action: "blocked", reasoning: execResult.error });
            } else {
              updateStep(execStepId, { status: "done", reasoning: `${decision.action} executed` });
            }
            if (execResult?.screenshot) {
              setCurrentScreenshot(execResult.screenshot);
              recordFrame(execResult.screenshot, `After: ${execReasoning}`, decision.action);
              updateStep(execStepId, { screenshot: execResult.screenshot });
            }
          } catch (e: any) {
            updateStep(execStepId, { status: "error", reasoning: `Action failed: ${e.message}` });
          }
        }

        const waitTime = decision.action === "wait" ? (decision.params?.seconds || 2) * 1000 : 1500;
        await new Promise((r) => setTimeout(r, waitTime));
        await refreshLatestScreenshot(curSid, curToken, latestStepId ?? thinkStepId, `Settled: ${execReasoning}`, decision.action);
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
    setFindings([]);
    findingsRef.current = [];
  };

  const buildEngagementExport = (): EngagementExport => ({
    name: engagementRef.current.name || "Untitled engagement",
    type: engagementRef.current.type,
    inScope: engagementRef.current.inScope,
    outOfScope: engagementRef.current.outOfScope,
    intensity: engagementRef.current.intensity,
    authorized: engagementRef.current.authorized,
    task: taskRef.current,
    startedAt: engagementStartRef.current || new Date().toISOString(),
    endedAt: new Date().toISOString(),
  });

  const findingsAsExport = (): FindingExport[] => findingsRef.current.map((f) => ({
    id: f.id, title: f.title, severity: f.severity, category: f.category,
    cvssVector: f.cvssVector, cvssScore: f.cvssScore, affectedUrl: f.affectedUrl,
    description: f.description, reproductionSteps: f.reproductionSteps,
    remediation: f.remediation, evidenceFrameIndices: f.evidenceFrameIndices,
    request: f.request, response: f.response, reportedAt: f.reportedAt,
  }));

  const exportMarkdown = () => {
    const md = findingsToMarkdown(buildEngagementExport(), findingsAsExport(), summary || "");
    downloadBlob(md, `bug-bounty-${new Date().toISOString().slice(0, 10)}.md`, "text/markdown");
    toast.success("Markdown report downloaded");
  };

  const exportJson = () => {
    const j = findingsToJson(buildEngagementExport(), findingsAsExport(), summary || "");
    downloadBlob(j, `bug-bounty-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    toast.success("JSON report downloaded");
  };

  const stopAndWipe = useCallback(async () => {
    abortRef.current = true;
    stopKeepalive();
    if (sessionId) {
      try { await cuApi("stop_session", { sessionId, envdAccessToken: envdToken }, getToken, 10_000); } catch {}
    }
    framesRef.current = [];
    findingsRef.current = [];
    setFindings([]);
    setSteps([]);
    setSummary(null);
    setCurrentScreenshot(null);
    setSessionId(null);
    setEnvdToken(null);
    sessionRef.current = null;
    setIsRunning(false);
    setStatus("idle");
    toast.success("Sandbox destroyed and local evidence wiped");
  }, [sessionId, envdToken, getToken, stopKeepalive]);

  // Build a WebM video from captured frames using canvas + MediaRecorder
  const buildVideoFromFrames = useCallback(async (frames: { base64: string; t: number; reasoning?: string; action?: string }[]): Promise<Blob | null> => {
    if (frames.length === 0) return null;

    // Load first frame to determine dimensions
    const loadImg = (b64: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `data:image/png;base64,${b64}`;
    });

    const firstImg = await loadImg(frames[0].base64);
    const W = Math.min(firstImg.width, 1280);
    const H = Math.round((W / firstImg.width) * firstImg.height);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Check MediaRecorder support
    if (typeof MediaRecorder === "undefined") {
      console.warn("MediaRecorder not supported");
      return null;
    }

    const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mimeType) return null;

    const fps = 2; // 2 frames/sec — keeps file small while still showing motion
    const stream = (canvas as any).captureStream(fps) as MediaStream;
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 800_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    recorder.start();
    // Paint each frame at fixed interval; each frame held for 1/fps seconds
    const frameDurationMs = 1000 / fps;

    // Word-wrap helper for reasoning overlay
    const wrapText = (text: string, maxWidth: number, font: string): string[] => {
      ctx.font = font;
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
        if (lines.length >= 4) break; // cap at 4 lines
      }
      if (line && lines.length < 4) lines.push(line);
      if (lines.length === 4 && line) lines[3] = lines[3].slice(0, -1) + "…";
      return lines;
    };

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const img = await loadImg(frame.base64);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);

      // === Reasoning overlay (top banner) ===
      if (frame.reasoning) {
        const padding = 12;
        const font = "bold 14px system-ui, -apple-system, sans-serif";
        const lineHeight = 18;
        const maxTextWidth = W - padding * 2 - 8;
        const lines = wrapText(frame.reasoning, maxTextWidth, font);
        const actionLabel = frame.action ? `▸ ${frame.action.toUpperCase()}` : "";
        const totalLines = lines.length + (actionLabel ? 1 : 0);
        const bannerH = padding * 2 + totalLines * lineHeight;

        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(0, 0, W, bannerH);
        ctx.fillStyle = "rgba(99, 102, 241, 0.9)";
        ctx.fillRect(0, bannerH - 2, W, 2);

        let y = padding + 14;
        if (actionLabel) {
          ctx.font = "bold 11px monospace";
          ctx.fillStyle = "#a5b4fc";
          ctx.fillText(actionLabel, padding, y);
          y += lineHeight;
        }
        ctx.font = font;
        ctx.fillStyle = "#fff";
        for (const line of lines) {
          ctx.fillText(line, padding, y);
          y += lineHeight;
        }
      }

      // === Timestamp overlay (bottom-left) ===
      const ts = new Date(frame.t).toLocaleTimeString();
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(8, H - 28, 200, 22);
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.fillText(`${ts}  frame ${i + 1}/${frames.length}`, 14, H - 12);

      await new Promise((r) => setTimeout(r, frameDurationMs));
    }
    // Hold last frame briefly
    await new Promise((r) => setTimeout(r, 500));
    recorder.stop();
    return finished;
  }, []);

  const downloadBugBountyReport = useCallback(async () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString();

    // Build screen recording video from captured frames
    let videoBlob: Blob | null = null;
    let videoDataUrl: string | null = null;
    const frameCount = framesRef.current.length;
    if (frameCount > 0) {
      try {
        setIsBuildingVideo(true);
        toast.info(`Building screen recording from ${frameCount} frames...`);
        videoBlob = await buildVideoFromFrames(framesRef.current);
        if (videoBlob) {
          // Convert to base64 data URL for embedding in HTML
          videoDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(videoBlob!);
          });
        }
      } catch (e) {
        console.warn("Failed to build video:", e);
        toast.error("Could not build screen recording — report will still include screenshots");
      } finally {
        setIsBuildingVideo(false);
      }
    }

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

${videoDataUrl ? `
<h2>📹 Video Evidence</h2>
<div style="margin:12px 0 24px;padding:12px;background:#0f172a;border-radius:8px;text-align:center;">
  <video controls preload="metadata" style="max-width:100%;border-radius:6px;background:#000;" src="${videoDataUrl}"></video>
  <div style="font-size:10px;color:#94a3b8;margin-top:8px;font-family:monospace;">
    ${frameCount} frames · ${Math.round(frameCount / 2)}s playback @ 2 fps · WebM
  </div>
  <div style="font-size:10px;color:#cbd5e1;margin-top:4px;">
    Note: Video plays in HTML reports. PDF prints will show a placeholder — keep the .webm file for visual evidence.
  </div>
</div>
` : `
<h2>📹 Video Evidence</h2>
<p style="color:#94a3b8;font-style:italic;font-size:12px;">No screen recording captured.</p>
`}

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

    // Always offer the raw video file as a separate download for archival
    if (videoBlob) {
      const vUrl = URL.createObjectURL(videoBlob);
      const va = document.createElement("a");
      va.href = vUrl;
      va.download = `bug-bounty-recording-${dateStr}.webm`;
      va.click();
      setTimeout(() => URL.revokeObjectURL(vUrl), 1000);
      toast.success(`Screen recording saved (${(videoBlob.size / 1024).toFixed(0)} KB)`);
    }
  }, [summary, buildVideoFromFrames]);

  const getStatusIcon = (s: AgentStep["status"]) => {
    switch (s) {
      case "executing": return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
      case "done": return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case "error": return <AlertCircle className="h-3 w-3 text-destructive" />;
      case "blocked": return <ShieldAlert className="h-3 w-3 text-amber-500" />;
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
              placeholder='e.g. "Test target.com for reflected XSS in the search field"'
              className="text-xs"
              onKeyDown={(e) => { if (e.key === "Enter" && engagement.authorized) startSession(); }}
            />
            <Button onClick={() => setShowEngagementForm((v) => !v)} size="sm" variant="outline" className="gap-1.5 px-3">
              <Shield className="h-3.5 w-3.5" /> Scope
            </Button>
            <Button onClick={startSession} size="sm" className="gap-1.5 px-4" disabled={!engagement.authorized}>
              <Play className="h-3.5 w-3.5" /> Start
            </Button>
          </div>

          {showEngagementForm && (
            <div className="space-y-2 p-3 rounded-md border border-border bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Engagement name</Label>
                  <Input value={engagement.name} onChange={(e) => setEngagement({ ...engagement, name: e.target.value })} placeholder="Acme Corp Q1 Pentest" className="h-7 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Type</Label>
                  <select value={engagement.type} onChange={(e) => setEngagement({ ...engagement, type: e.target.value as EngagementType })} className="h-7 w-full text-xs rounded-md border border-input bg-background px-2">
                    {Object.entries(ENGAGEMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">In-scope hosts (one per line, supports *.example.com)</Label>
                <Textarea value={scopeText} onChange={(e) => setScopeText(e.target.value)} placeholder="example.com&#10;*.example.com" className="text-[11px] font-mono min-h-[60px]" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Out-of-scope (overrides in-scope)</Label>
                <Textarea value={outScopeText} onChange={(e) => setOutScopeText(e.target.value)} placeholder="admin.example.com" className="text-[11px] font-mono min-h-[40px]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Test intensity</Label>
                  <select value={engagement.intensity} onChange={(e) => setEngagement({ ...engagement, intensity: e.target.value as IntensityLevel })} className="h-7 w-full text-xs rounded-md border border-input bg-background px-2">
                    <option value="passive">Passive recon only</option>
                    <option value="active">Active probing</option>
                    <option value="exploitation">Exploitation PoC</option>
                  </select>
                </div>
                <div className="space-y-1.5 pt-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px]">Scope lock</Label>
                    <Switch checked={engagement.scopeLockEnabled} onCheckedChange={(v) => setEngagement({ ...engagement, scopeLockEnabled: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px]">Allow exploitation</Label>
                    <Switch checked={engagement.allowExploitation} onCheckedChange={(v) => setEngagement({ ...engagement, allowExploitation: v })} />
                  </div>
                </div>
              </div>
              <label className="flex items-start gap-2 text-[11px] text-foreground cursor-pointer pt-1">
                <input type="checkbox" checked={engagement.authorized} onChange={(e) => setEngagement({ ...engagement, authorized: e.target.checked })} className="mt-0.5" />
                <span>I confirm I have written authorization to test these targets.</span>
              </label>
              {engagement.authorized && (
                <div className="flex items-center gap-1.5 text-[10px] text-green-500">
                  <ShieldCheck className="h-3 w-3" /> Authorized engagement ready
                </div>
              )}
            </div>
          )}
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
                      <Button variant="secondary" size="sm" className="flex-1 text-xs gap-1.5" onClick={downloadBugBountyReport} disabled={isBuildingVideo}>
                        {isBuildingVideo ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                        {isBuildingVideo ? "Building video..." : `Download Report${framesRef.current.length > 0 ? ` + Video (${framesRef.current.length}f)` : ""}`}
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

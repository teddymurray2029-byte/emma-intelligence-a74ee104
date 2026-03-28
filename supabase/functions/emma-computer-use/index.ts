import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Buffer } from "node:buffer";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";
import { PNG } from "npm:pngjs@7.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DESKTOP_BOOT_TIMEOUT_MS = 90_000;
const DESKTOP_BOOT_POLL_MS = 3_000;
const E2B_API_BASE = "https://api.e2b.app";
const ENVD_PORT = 49983;
const CONNECT_PROTOCOL_VERSION = "1";

type SandboxSession = {
  sandboxId: string;
  envdAccessToken: string;
  domain?: string;
  desktopInitialized?: boolean;
};

type ScreenshotAnalysis = {
  meaningful: boolean;
  averageBrightness: number;
  nonDarkRatio: number;
};

async function getClerkUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS);
    return (payload.sub as string) || null;
  } catch { return null; }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const sandboxCache = new Map<string, SandboxSession>();

function getEnvdBaseUrl(sandboxId: string) {
  return `https://${ENVD_PORT}-${sandboxId}.e2b.app`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeMaybeBase64(value: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
  } catch {
    return value;
  }
}

async function e2bApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = Deno.env.get("E2B_API_KEY");
  if (!apiKey) throw new Error("E2B_API_KEY not configured");

  console.log(`[e2b-api] ${init.method || "GET"} ${path}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(`${E2B_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "X-API-Key": apiKey,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[e2b-api] ${path} failed [${response.status}]: ${text}`);
      throw new Error(`E2B API ${path} failed [${response.status}]: ${text}`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function connectSandbox(sandboxId: string): Promise<SandboxSession> {
  const cached = sandboxCache.get(sandboxId);
  if (cached) return cached;

  const candidates: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [
    { path: `/sandboxes/${sandboxId}/connect`, method: "POST", body: { timeout: 300 } },
    { path: `/sandboxes/${sandboxId}/resume`, method: "POST", body: {} },
    { path: `/sandboxes/${sandboxId}`, method: "GET" },
  ];

  let lastError = "Unable to connect to sandbox";

  for (const candidate of candidates) {
    try {
      const data = await e2bApi<{ sandboxID?: string; envdAccessToken?: string; domain?: string }>(candidate.path, {
        method: candidate.method,
        ...(candidate.body ? { body: JSON.stringify(candidate.body) } : {}),
      });

      if (data.sandboxID && data.envdAccessToken) {
        const session: SandboxSession = {
          sandboxId: data.sandboxID,
          envdAccessToken: data.envdAccessToken,
          domain: data.domain,
        };
        sandboxCache.set(session.sandboxId, session);
        return session;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to connect to sandbox";
      if (candidate.path.endsWith("/resume") && message.includes("already running")) {
        continue;
      }
      lastError = message;
    }
  }

  throw new Error(lastError);
}

// SDK-aligned: pass DISPLAY=:0 as env at sandbox creation
async function createSandbox(userId: string, task?: string): Promise<SandboxSession> {
  const data = await e2bApi<{ sandboxID: string; envdAccessToken: string; domain?: string }>("/sandboxes", {
    method: "POST",
    body: JSON.stringify({
      templateID: "desktop",
      timeout: 300,
      autoPause: false,
      allow_internet_access: true,
      secure: true,
      envs: { DISPLAY: ":0" },
      metadata: { userId, task: task || "general" },
    }),
  });

  const session: SandboxSession = {
    sandboxId: data.sandboxID,
    envdAccessToken: data.envdAccessToken,
    domain: data.domain,
  };

  sandboxCache.set(session.sandboxId, session);
  return session;
}

function analyzeScreenshot(bytes: Uint8Array): ScreenshotAnalysis {
  try {
    const png = PNG.sync.read(Buffer.from(bytes));
    let brightPixels = 0;
    let brightnessTotal = 0;

    for (let i = 0; i < png.data.length; i += 4) {
      const alpha = png.data[i + 3] / 255;
      const brightness = (((png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3) * alpha);
      brightnessTotal += brightness;
      if (brightness > 40) brightPixels += 1;
    }

    const pixelCount = Math.max(1, png.width * png.height);
    const averageBrightness = brightnessTotal / pixelCount;
    const nonDarkRatio = brightPixels / pixelCount;

    return {
      meaningful: averageBrightness > 12 && nonDarkRatio > 0.03,
      averageBrightness,
      nonDarkRatio,
    };
  } catch (error) {
    console.warn(`[screenshot] analysis failed, treating frame as meaningful: ${error instanceof Error ? error.message : String(error)}`);
    return { meaningful: true, averageBrightness: 255, nonDarkRatio: 1 };
  }
}

// ===== SDK-ALIGNED kickstartDesktop =====
// Matches E2B Desktop SDK's _start() method exactly:
// 1. Xvfb with -retro -dpi 96 -nolisten flags
// 2. Verify with xdpyinfo (not socket file check)
// 3. Start XFCE directly (not via dbus-launch wrapper)
// 4. Start VNC for live streaming
async function kickstartDesktop(sandbox: SandboxSession): Promise<void> {
  const cached = sandboxCache.get(sandbox.sandboxId);
  if (cached?.desktopInitialized) return;

  // Step 1: Start Xvfb with SDK-correct flags
  console.log(`[kickstart] step1: start Xvfb for ${sandbox.sandboxId}`);
  try {
    const xvfbResult = await runCommand(
      sandbox, "bash",
      ["-c", `
        if xdpyinfo -display :0 >/dev/null 2>&1; then
          echo 'display-already-active'
        elif pgrep -x Xvfb >/dev/null; then
          echo 'xvfb-process-exists-but-display-not-ready'
          kill -9 $(pgrep -x Xvfb) 2>/dev/null || true
          sleep 0.5
          Xvfb :0 -screen 0 1024x768x24 -ac -retro -dpi 96 -nolisten tcp -nolisten unix &
          echo 'xvfb-restarted'
        else
          Xvfb :0 -screen 0 1024x768x24 -ac -retro -dpi 96 -nolisten tcp -nolisten unix &
          echo 'xvfb-started'
        fi
      `.trim()],
      10, {},
    );
    console.log(`[kickstart] xvfb: exit=${xvfbResult.exitCode} out=${xvfbResult.stdout.trim()}`);
  } catch (e) {
    console.error(`[kickstart] xvfb launch error: ${e}`);
  }

  // Step 2: Poll for display with xdpyinfo (SDK method)
  console.log(`[kickstart] step2: poll display with xdpyinfo`);
  try {
    const pollResult = await runCommand(
      sandbox, "bash",
      ["-c", "for i in $(seq 1 20); do xdpyinfo -display :0 >/dev/null 2>&1 && echo 'display-ready' && exit 0; sleep 0.5; done; echo 'display-timeout'; exit 1"],
      15, {},
    );
    console.log(`[kickstart] xdpyinfo poll: exit=${pollResult.exitCode} out=${pollResult.stdout.trim()}`);
    if (pollResult.exitCode !== 0) {
      console.warn(`[kickstart] Display :0 not ready after 10s (xdpyinfo failed)`);
      return;
    }
  } catch (e) {
    console.error(`[kickstart] xdpyinfo poll error: ${e}`);
    return;
  }

  // Step 3: Start XFCE directly (SDK-aligned: just run startxfce4 in background)
  console.log(`[kickstart] step3: start WM (SDK-aligned)`);
  try {
    const wmResult = await runCommand(
      sandbox, "bash",
      ["-c", `
        if xdotool getwindowfocus >/dev/null 2>&1; then
          echo 'wm-has-focus-window'
        else
          export DISPLAY=:0
          export XDG_RUNTIME_DIR=\${XDG_RUNTIME_DIR:-/tmp/runtime-root}
          mkdir -p "$XDG_RUNTIME_DIR"
          chmod 700 "$XDG_RUNTIME_DIR"
          startxfce4 &
          XFCE_PID=$!
          echo "wm-started-pid=$XFCE_PID"
        fi
      `.trim()],
      10, {},
    );
    console.log(`[kickstart] wm: exit=${wmResult.exitCode} out=${wmResult.stdout.trim()}`);
  } catch (e) {
    console.error(`[kickstart] wm launch error: ${e}`);
  }

  sandboxCache.set(sandbox.sandboxId, { ...sandbox, desktopInitialized: true });
}

function collectProcessOutput(value: unknown, state: { stdout: string; stderr: string; exitCode?: number }) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectProcessOutput(item, state));
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (typeof entry === "number" && normalizedKey === "exitcode") {
      state.exitCode = entry;
      continue;
    }
    if (typeof entry === "string" && normalizedKey === "stdout") {
      state.stdout += decodeMaybeBase64(entry);
      continue;
    }
    if (typeof entry === "string" && normalizedKey === "stderr") {
      state.stderr += decodeMaybeBase64(entry);
      continue;
    }
    if (typeof entry === "object") {
      collectProcessOutput(entry, state);
    }
  }
}

function buildConnectEnvelope(message: Record<string, unknown>): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(message));
  const envelope = new Uint8Array(5 + payload.length);
  envelope[0] = 0;
  new DataView(envelope.buffer).setUint32(1, payload.length, false);
  envelope.set(payload, 5);
  return envelope;
}

function parseConnectStream(raw: Uint8Array): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  let offset = 0;
  while (offset + 5 <= raw.length) {
    const _flags = raw[offset];
    const length = new DataView(raw.buffer, raw.byteOffset + offset + 1, 4).getUint32(0, false);
    offset += 5;
    if (offset + length > raw.length) break;
    const chunk = new TextDecoder().decode(raw.slice(offset, offset + length));
    offset += length;
    try {
      results.push(JSON.parse(chunk));
    } catch {}
  }
  return results;
}

async function runCommand(
  sandbox: SandboxSession,
  cmd: string,
  args: string[] = [],
  timeout = 15,
  envs: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), (timeout + 5) * 1000);

  try {
    const response = await fetch(`${getEnvdBaseUrl(sandbox.sandboxId)}/process.Process/Start`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "X-Access-Token": sandbox.envdAccessToken,
        "Connect-Protocol-Version": CONNECT_PROTOCOL_VERSION,
        "Content-Type": "application/connect+json",
      },
      body: buildConnectEnvelope({
        process: { cmd, args, envs: { DISPLAY: ":0", ...envs } },
        stdin: false,
        timeout,
      }),
    });

    if (!response.ok) {
      throw new Error(`E2B command failed [${response.status}]: ${await response.text()}`);
    }

    const state: { stdout: string; stderr: string; exitCode?: number } = { stdout: "", stderr: "" };
    const rawBytes = new Uint8Array(await response.arrayBuffer());
    const messages = parseConnectStream(rawBytes);
    messages.forEach((msg) => collectProcessOutput(msg, state));

    for (const msg of messages) {
      const event = (msg as any)?.event;
      if (event?.end) {
        const statusStr: string = event.end.status || "";
        const match = statusStr.match(/exit status (\d+)/);
        if (match) state.exitCode = parseInt(match[1], 10);
        else if (event.end.exited) state.exitCode = 0;
      }
    }

    return { stdout: state.stdout, stderr: state.stderr, exitCode: state.exitCode ?? 0 };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readSandboxFile(sandbox: SandboxSession, path: string): Promise<Uint8Array> {
  const response = await fetch(`${getEnvdBaseUrl(sandbox.sandboxId)}/files?path=${encodeURIComponent(path)}`, {
    headers: { "X-Access-Token": sandbox.envdAccessToken },
  });
  if (!response.ok) {
    throw new Error(`E2B file download failed [${response.status}]: ${await response.text()}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function getSandbox(sandboxId: string, envdAccessToken?: string | null): Promise<SandboxSession> {
  if (envdAccessToken) {
    const cached = sandboxCache.get(sandboxId);
    const session: SandboxSession = {
      sandboxId,
      envdAccessToken,
      domain: cached?.domain,
      desktopInitialized: cached?.desktopInitialized,
    };
    sandboxCache.set(sandboxId, session);
    return session;
  }
  return await connectSandbox(sandboxId);
}

// SDK-aligned screenshot: use scrot --pointer with unique filenames
async function captureScreenshot(sandbox: SandboxSession): Promise<string> {
  return (await captureScreenshotData(sandbox)).base64;
}

async function captureScreenshotData(sandbox: SandboxSession): Promise<{ base64: string; analysis: ScreenshotAnalysis }> {
  const screenshotPath = `/tmp/screenshot-${Date.now()}.png`;
  const methods: Array<{ label: string; cmd: string; args: string[] }> = [
    { label: "scrot", cmd: "scrot", args: ["--pointer", screenshotPath] },
    { label: "scrot-bash", cmd: "bash", args: ["-c", `scrot --pointer ${screenshotPath}`] },
  ];

  let lastError = "";
  for (const method of methods) {
    try {
      const result = await runCommand(sandbox, method.cmd, method.args, 10);
      if (result.exitCode === 0) {
        const bytes = await readSandboxFile(sandbox, screenshotPath);
        // Cleanup async
        runCommand(sandbox, "rm", ["-f", screenshotPath], 3).catch(() => {});
        return {
          base64: toBase64(bytes),
          analysis: analyzeScreenshot(bytes),
        };
      }
      lastError = result.stderr || result.stdout || `exit ${result.exitCode}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Unknown error";
    }
  }

  throw new Error(`Screenshot failed: ${lastError}`);
}

// SDK-aligned stage detection: xdpyinfo + xdotool getwindowfocus
async function getDesktopStage(sandbox: SandboxSession): Promise<string> {
  try {
    const r = await runCommand(sandbox, "bash", ["-c",
      "echo -n 'display='; xdpyinfo -display :0 >/dev/null 2>&1 && echo yes || echo no; " +
      "echo -n 'wm_focus='; xdotool getwindowfocus >/dev/null 2>&1 && echo yes || echo no"
    ], 5);
    return r.stdout.trim();
  } catch {
    return "unknown";
  }
}

async function waitForDesktopReady(sandbox: SandboxSession): Promise<{
  ready: boolean;
  screenshot?: string;
  waitedMs: number;
  message: string;
  stage?: string;
  error?: string;
  errorCode?: string;
  
}> {
  const startedAt = Date.now();
  let lastError = "Desktop is still starting";
  let lastStage = "";
  let lastErrorCode = "boot_in_progress";
  let blackFrameCount = 0;

  while (Date.now() - startedAt < DESKTOP_BOOT_TIMEOUT_MS) {
    // Check current boot stage with SDK-aligned checks
    lastStage = await getDesktopStage(sandbox);
    const elapsed = Date.now() - startedAt;
    console.log(`[wait_ready] stage: ${lastStage} elapsed=${elapsed}ms`);

    const hasDisplay = lastStage.includes("display=yes");
    const hasWmFocus = lastStage.includes("wm_focus=yes");

    // Re-kickstart if display or WM not ready
    if (!hasDisplay || !hasWmFocus) {
      lastErrorCode = !hasDisplay ? "display_not_ready" : "window_manager_not_ready";
      lastError = `Desktop boot is incomplete (${lastStage.replace(/\n/g, ", ")})`;
      console.log(`[wait_ready] not ready (${lastErrorCode}), re-kickstarting...`);
      sandboxCache.set(sandbox.sandboxId, { ...sandbox, desktopInitialized: false });
      try {
        await kickstartDesktop({ ...sandbox, desktopInitialized: false });
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Kickstart failed";
        lastErrorCode = "kickstart_failed";
      }
      await new Promise((r) => setTimeout(r, DESKTOP_BOOT_POLL_MS));
      continue;
    }

    // Display is up + WM has focus — try screenshot
    try {
      const { base64: screenshot, analysis } = await captureScreenshotData(sandbox);
      if (!analysis.meaningful) {
        blackFrameCount += 1;
        lastErrorCode = "black_screen";
        lastError = `Desktop is still rendering a black frame (brightness=${analysis.averageBrightness.toFixed(1)}, visible=${(analysis.nonDarkRatio * 100).toFixed(1)}%)`;
        console.warn(`[wait_ready] black screenshot ${blackFrameCount}: ${lastError}`);

        if (blackFrameCount >= 3) {
          // Force restart the WM
          sandboxCache.set(sandbox.sandboxId, { ...sandbox, desktopInitialized: false });
          try {
            await runCommand(sandbox, "bash", ["-c", "pkill -9 -f startxfce4; pkill -9 xfwm4; pkill -9 xfdesktop; sleep 1"], 5);
            await kickstartDesktop({ ...sandbox, desktopInitialized: false });
            blackFrameCount = 0; // Reset after force restart
          } catch (e) {
            lastError = e instanceof Error ? e.message : lastError;
            lastErrorCode = "kickstart_failed";
          }
        }

        await new Promise((r) => setTimeout(r, DESKTOP_BOOT_POLL_MS));
        continue;
      }

      return {
        ready: true,
        screenshot,
        waitedMs: Date.now() - startedAt,
        message: "Desktop ready",
        stage: lastStage,
        errorCode: undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Screenshot capture failed";
      lastErrorCode = "screenshot_failed";
      console.log(`[wait_ready] screenshot failed: ${lastError}`);
    }

    await new Promise((r) => setTimeout(r, DESKTOP_BOOT_POLL_MS));
  }

  return {
    ready: false,
    waitedMs: Date.now() - startedAt,
    message: lastErrorCode === "black_screen" ? "Desktop stayed black during startup" : "Desktop boot timed out",
    stage: lastStage,
    error: lastError,
    errorCode: lastErrorCode,
  };
}

async function aiReason(
  screenshotBase64: string,
  task: string,
  actionHistory: { action: string; reasoning: string }[],
  userMessage?: string
): Promise<{ action: string; params: any; reasoning: string; done: boolean; summary?: string }> {
  const openaiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!openaiKey) throw new Error("LOVABLE_API_KEY not configured");

  const historyText = actionHistory.length > 0
    ? `\n\nActions taken so far:\n${actionHistory.map((a, i) => `${i + 1}. [${a.action}] ${a.reasoning}`).join("\n")}`
    : "";

  const userIntervention = userMessage ? `\n\nUser intervention message: "${userMessage}"` : "";

  const systemPrompt = `You are Emma, a computer-use AI agent controlling a virtual desktop. You can see screenshots and must decide what action to take next.

Your task: ${task}${historyText}${userIntervention}

Analyze the screenshot and respond with a JSON object (no markdown, just raw JSON):
{
  "reasoning": "Brief explanation of what you see and why you're taking this action",
  "action": "one of: click, double_click, type, hotkey, scroll, move_mouse, wait, open_url, done",
  "params": {
    // For click/double_click/move_mouse: {"x": number, "y": number}
    // For type: {"text": "string to type"}
    // For hotkey: {"keys": ["ctrl", "a"]}
    // For scroll: {"x": number, "y": number, "direction": "up" or "down", "amount": 3}
    // For open_url: {"url": "https://..."}
    // For wait: {"seconds": 2}
    // For done: {}
  },
  "done": false,
  "summary": "Only when done=true, provide a complete summary of what was accomplished"
}

Rules:
- Think step by step before each action
- Always verify your actions by looking at the next screenshot
- If you see a login page and don't have credentials, set done=true and explain you need credentials
- If asked to do something dangerous or clearly unethical, refuse and set done=true
- Coordinates are relative to a 1024x768 screen resolution
- Be precise with click coordinates — aim for the center of buttons/links
- After typing, sometimes you need to press Enter (use hotkey)
- For web navigation, use open_url to go directly to websites
- Maximum 50 actions per task — if you hit the limit, summarize progress and set done=true`;

  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this screenshot and decide the next action:" },
            { type: "image_url", image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`AI reasoning failed: ${err}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "";

  let jsonStr = content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(jsonStr);
  } catch {
    return { action: "done", params: {}, reasoning: "Failed to parse AI response: " + content.slice(0, 200), done: true, summary: "Agent encountered a parsing error." };
  }
}

// ===== xdotool-based action execution (replaces pyautogui) =====
function buildXdotoolCommand(actionType: string, params: any): { cmd: string; args: string[] } | null {
  switch (actionType) {
    case "click": {
      const x = params.x ?? 512;
      const y = params.y ?? 384;
      return { cmd: "bash", args: ["-c", `xdotool mousemove --sync ${x} ${y} && xdotool click 1`] };
    }
    case "double_click": {
      const x = params.x ?? 512;
      const y = params.y ?? 384;
      return { cmd: "bash", args: ["-c", `xdotool mousemove --sync ${x} ${y} && xdotool click --repeat 2 --delay 100 1`] };
    }
    case "move_mouse": {
      return { cmd: "bash", args: ["-c", `xdotool mousemove --sync ${params.x} ${params.y}`] };
    }
    case "type": {
      // xdotool type with delay; escape special chars
      const text = (params.text || "").replace(/'/g, "'\\''");
      // For long text, chunk it
      if (text.length > 100) {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += 50) {
          chunks.push(text.slice(i, i + 50));
        }
        const cmds = chunks.map(c => `xdotool type --delay 12 '${c}'`).join(" && ");
        return { cmd: "bash", args: ["-c", cmds] };
      }
      return { cmd: "bash", args: ["-c", `xdotool type --delay 12 '${text}'`] };
    }
    case "hotkey": {
      const keys = (params.keys as string[]).join("+");
      return { cmd: "bash", args: ["-c", `xdotool key ${keys}`] };
    }
    case "press": {
      return { cmd: "bash", args: ["-c", `xdotool key ${params.key}`] };
    }
    case "scroll": {
      const clicks = params.amount || 3;
      const button = params.direction === "up" ? 4 : 5;
      const sx = params.x ?? 512;
      const sy = params.y ?? 384;
      return { cmd: "bash", args: ["-c", `xdotool mousemove --sync ${sx} ${sy} && xdotool click --repeat ${clicks} --delay 50 ${button}`] };
    }
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("E2B_API_KEY");
  if (!apiKey) return json({ error: "E2B_API_KEY not configured" }, 500);

  try {
    const body = await req.json();
    const { action } = body;
    console.log(`[emma-cu] action=${action}`);

    const userId = await getClerkUserId(req);
    if (!userId) return json({ error: "Unauthorized — sign in required" }, 401);

    switch (action) {
      case "start_session": {
        console.log("[emma-cu] Creating sandbox...");
        const sandbox = await createSandbox(userId, body.task);
        console.log(`[emma-cu] Sandbox created: ${sandbox.sandboxId}`);

        // Fire-and-forget: start desktop in background, don't await
        kickstartDesktop(sandbox).catch((e) =>
          console.error(`[emma-cu] Background kickstart failed: ${e}`)
        );

        return json({
          sessionId: sandbox.sandboxId,
          envdAccessToken: sandbox.envdAccessToken,
          status: "created",
        });
      }

      case "screenshot": {
        const { sessionId, envdAccessToken } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        try {
          const sandbox = await getSandbox(sessionId, envdAccessToken);
          const { base64: screenshot, analysis } = await captureScreenshotData(sandbox);
          return json({ screenshot, analysis });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Screenshot unavailable";
          return json({ error: msg, status: "screenshot_failed" }, 503);
        }
      }

      case "wait_until_ready": {
        const { sessionId, envdAccessToken } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        const sandbox = await getSandbox(sessionId, envdAccessToken);
        console.log(`[emma-cu] wait_until_ready for ${sessionId}`);
        const readiness = await waitForDesktopReady(sandbox);
        console.log(`[emma-cu] readiness: ready=${readiness.ready} code=${readiness.errorCode || "ok"} stage=${readiness.stage} waited=${readiness.waitedMs}ms`);

        return readiness.ready
          ? json({ ...readiness, status: "ready" })
          : json({ ...readiness, status: "boot_failed" }, 408);
      }

      case "execute": {
        const { sessionId, actionType, params, envdAccessToken } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        const sandbox = await getSandbox(sessionId, envdAccessToken);
        let result: any = { success: true };

        if (actionType === "open_url") {
          await runCommand(
            sandbox, "bash",
            ["-c", `xdg-open ${JSON.stringify(params.url)} >/tmp/xdg-open.log 2>&1 &`],
            10,
          );
        } else if (actionType === "wait") {
          result = { success: true, waited: params.seconds || 2 };
        } else {
          const xdoCmd = buildXdotoolCommand(actionType, params);
          if (xdoCmd) {
            try {
              const cmdResult = await runCommand(sandbox, xdoCmd.cmd, xdoCmd.args, 15);
              if (cmdResult.exitCode !== 0) {
                result = { success: false, error: cmdResult.stderr || cmdResult.stdout || "Command failed" };
              }
            } catch (e) {
              result = { success: false, error: e instanceof Error ? e.message : "Command execution failed" };
            }
          }
        }

        return json(result);
      }

      case "think": {
        const { sessionId, task, actionHistory, userMessage, envdAccessToken } = body;
        if (!sessionId || !task) return json({ error: "Missing sessionId or task" }, 400);

        const sandbox = await getSandbox(sessionId, envdAccessToken);
        let screenshotBase64 = "";

        try {
          const screenshot = await captureScreenshotData(sandbox);
          screenshotBase64 = screenshot.base64;

          if (!screenshot.analysis.meaningful) {
            const stage = await getDesktopStage(sandbox);
            sandboxCache.set(sandbox.sandboxId, { ...sandbox, desktopInitialized: false });
            kickstartDesktop({ ...sandbox, desktopInitialized: false }).catch((e) =>
              console.error(`[emma-cu] think black-screen recovery failed: ${e}`)
            );

            return json({
              action: "wait",
              params: { seconds: 3 },
              reasoning: `Desktop is still rendering a black frame (${stage.replace(/\n/g, ", ")}). Waiting for a usable screenshot before taking action.`,
              done: false,
              screenshot: screenshotBase64,
              stage,
              status: "black_screen",
            });
          }
        } catch {}

        if (!screenshotBase64) {
          return json({
            action: "wait",
            params: { seconds: 3 },
            reasoning: "Could not capture screenshot, waiting for desktop to load",
            done: false,
          });
        }

        const decision = await aiReason(screenshotBase64, task, actionHistory || [], userMessage);
        return json({ ...decision, screenshot: screenshotBase64 });
      }

      case "stop_session": {
        const { sessionId } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        const sandbox = sandboxCache.get(sessionId);
        if (sandbox) {
          try {
            await fetch(`${E2B_API_BASE}/sandboxes/${sessionId}`, {
              method: "DELETE",
              headers: { "X-API-Key": apiKey },
            });
          } catch {} finally {
            sandboxCache.delete(sessionId);
          }
        }
        return json({ success: true, status: "destroyed" });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("emma-computer-use error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

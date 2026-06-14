import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Buffer } from "node:buffer";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.2.0";
import { PNG } from "https://esm.sh/pngjs@7.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DESKTOP_BOOT_TIMEOUT_MS = 90_000;
const DESKTOP_BOOT_POLL_MS = 3_000;
const E2B_API_BASE = "https://api.e2b.app";
const ENVD_PORT = 49983;
const CONNECT_PROTOCOL_VERSION = "1";
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

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
const idempotencyCache = new Map<string, { response: unknown; expiresAt: number }>();
const toolMetrics = new Map<string, { calls: number; failures: number; degraded: number; latencyTotalMs: number }>();
const toolCircuits = new Map<string, { failures: number; openUntil: number }>();

function markTool(tool: string, latencyMs: number, failed: boolean, degraded = false) {
  const metric = toolMetrics.get(tool) || { calls: 0, failures: 0, degraded: 0, latencyTotalMs: 0 };
  metric.calls += 1;
  metric.latencyTotalMs += latencyMs;
  if (failed) metric.failures += 1;
  if (degraded) metric.degraded += 1;
  toolMetrics.set(tool, metric);
}

async function reliableToolCall<T>(tool: string, traceId: string, work: () => Promise<T>, timeoutMs = 20_000): Promise<T> {
  const breaker = toolCircuits.get(tool) || { failures: 0, openUntil: 0 };
  if (breaker.openUntil > Date.now()) throw new Error(`CIRCUIT_OPEN:${tool}:${traceId}`);

  for (let attempt = 0; attempt < 3; attempt++) {
    const started = Date.now();
    try {
      const result = await Promise.race([
        work(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`TOOL_TIMEOUT:${tool}`)), timeoutMs)),
      ]);
      markTool(tool, Date.now() - started, false, attempt > 0);
      breaker.failures = 0;
      breaker.openUntil = 0;
      toolCircuits.set(tool, breaker);
      return result;
    } catch (error) {
      markTool(tool, Date.now() - started, true);
      breaker.failures += 1;
      if (breaker.failures >= 3) breaker.openUntil = Date.now() + 20_000;
      toolCircuits.set(tool, breaker);
      if (attempt === 2) throw error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1) + Math.floor(Math.random() * 250)));
    }
  }
  throw new Error("Tool retry exhausted");
}

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

async function connectSandbox(sandboxId: string, forceRefresh = false): Promise<SandboxSession> {
  const cached = sandboxCache.get(sandboxId);
  if (cached && !forceRefresh) return cached;

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

function syncSandboxSession(target: SandboxSession, source: SandboxSession) {
  target.envdAccessToken = source.envdAccessToken;
  target.domain = source.domain;
  target.desktopInitialized = source.desktopInitialized;
}

function isEnvdAuthError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("[401]") ||
    message.includes("[403]") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("access token")
  );
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

// ===== Coordinate grid overlay (Set-of-Marks technique for precise clicks) =====
// 3x5 bitmap font for digits — used to label gridlines so the model can read exact coordinates.
const DIGIT_FONT: Record<string, number[][]> = {
  "0": [[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  "1": [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[1,1,1]],
  "2": [[1,1,1],[0,0,1],[1,1,1],[1,0,0],[1,1,1]],
  "3": [[1,1,1],[0,0,1],[1,1,1],[0,0,1],[1,1,1]],
  "4": [[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1]],
  "5": [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  "6": [[1,1,1],[1,0,0],[1,1,1],[1,0,1],[1,1,1]],
  "7": [[1,1,1],[0,0,1],[0,1,0],[1,0,0],[1,0,0]],
  "8": [[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,1,1]],
  "9": [[1,1,1],[1,0,1],[1,1,1],[0,0,1],[1,1,1]],
};

function drawPixel(png: any, x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = 255;
}

function drawDigit(png: any, ch: string, x: number, y: number, r: number, g: number, b: number) {
  const glyph = DIGIT_FONT[ch]; if (!glyph) return;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (glyph[row][col]) drawPixel(png, x + col, y + row, r, g, b);
    }
  }
}

function drawLabel(png: any, text: string, x: number, y: number) {
  // Black background box for legibility
  const w = text.length * 4 + 1;
  const h = 7;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) drawPixel(png, x + dx, y + dy, 0, 0, 0);
  for (let i = 0; i < text.length; i++) drawDigit(png, text[i], x + 1 + i * 4, y + 1, 0, 255, 0);
}

function overlayGrid(bytes: Uint8Array): Uint8Array {
  try {
    const png = PNG.sync.read(Buffer.from(bytes));
    const STEP = 100;
    // Vertical lines
    for (let x = STEP; x < png.width; x += STEP) {
      for (let y = 0; y < png.height; y++) drawPixel(png, x, y, 0, 255, 0);
    }
    // Horizontal lines
    for (let y = STEP; y < png.height; y += STEP) {
      for (let x = 0; x < png.width; x++) drawPixel(png, x, y, 0, 255, 0);
    }
    // Labels at intersections
    for (let x = 0; x <= png.width; x += STEP) {
      for (let y = 0; y <= png.height; y += STEP) {
        drawLabel(png, `${x}`, Math.min(x + 2, png.width - 20), Math.min(y + 2, png.height - 8));
        drawLabel(png, `${y}`, Math.min(x + 2, png.width - 20), Math.min(y + 10, png.height - 8));
      }
    }
    return new Uint8Array(PNG.sync.write(png));
  } catch (e) {
    console.warn(`[grid] overlay failed: ${e instanceof Error ? e.message : String(e)}`);
    return bytes;
  }
}

function overlayGridBase64(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return toBase64(overlayGrid(bytes));
  } catch {
    return b64;
  }
}

// ===== Click refinement (zoom + fine grid + crosshair → ask model to re-center) =====
// Crops a window around the proposed click point, 2x upscales, overlays a fine
// 10-pixel grid (source coords) and a red crosshair at the proposed point.
// The model is then asked for the exact center of the intended UI target.
function cropAndAnnotateForRefine(bytes: Uint8Array, cx: number, cy: number, half = 110): { png: Uint8Array; x0: number; y0: number; w: number; h: number } | null {
  try {
    const src = PNG.sync.read(Buffer.from(bytes));
    const winW = Math.min(half * 2, src.width);
    const winH = Math.min(half * 2, src.height);
    const x0 = Math.max(0, Math.min(src.width - winW, cx - half));
    const y0 = Math.max(0, Math.min(src.height - winH, cy - half));
    const dst = new PNG({ width: winW * 2, height: winH * 2 });
    // 2x nearest-neighbor upscale
    for (let y = 0; y < winH; y++) {
      for (let x = 0; x < winW; x++) {
        const si = (((y0 + y) * src.width) + (x0 + x)) << 2;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const di = (((y * 2 + dy) * (winW * 2)) + (x * 2 + dx)) << 2;
            dst.data[di] = src.data[si];
            dst.data[di + 1] = src.data[si + 1];
            dst.data[di + 2] = src.data[si + 2];
            dst.data[di + 3] = 255;
          }
        }
      }
    }
    // Fine grid every 10 source px (= 20 dst px). Subtle so target stays visible.
    const STEP = 10;
    const firstX = Math.ceil(x0 / STEP) * STEP;
    const firstY = Math.ceil(y0 / STEP) * STEP;
    for (let sx = firstX; sx <= x0 + winW; sx += STEP) {
      const dx = (sx - x0) * 2;
      for (let y = 0; y < dst.height; y += 2) drawPixel(dst, dx, y, 0, 220, 0);
    }
    for (let sy = firstY; sy <= y0 + winH; sy += STEP) {
      const dy = (sy - y0) * 2;
      for (let x = 0; x < dst.width; x += 2) drawPixel(dst, x, dy, 0, 220, 0);
    }
    // Labels every 20 source px
    for (let sx = Math.ceil(x0 / 20) * 20; sx <= x0 + winW; sx += 20) {
      for (let sy = Math.ceil(y0 / 20) * 20; sy <= y0 + winH; sy += 20) {
        drawLabel(dst, `${sx}`, (sx - x0) * 2 + 2, (sy - y0) * 2 + 2);
        drawLabel(dst, `${sy}`, (sx - x0) * 2 + 2, (sy - y0) * 2 + 10);
      }
    }
    // Red crosshair + circle at proposed click point
    const px = (cx - x0) * 2;
    const py = (cy - y0) * 2;
    for (let i = -14; i <= 14; i++) {
      drawPixel(dst, px + i, py, 255, 30, 30);
      drawPixel(dst, px, py + i, 255, 30, 30);
    }
    for (let a = 0; a < 360; a += 6) {
      const rad = (a * Math.PI) / 180;
      for (let r = 3; r <= 5; r++) {
        drawPixel(dst, Math.round(px + Math.cos(rad) * r), Math.round(py + Math.sin(rad) * r), 255, 30, 30);
      }
    }
    return { png: new Uint8Array(PNG.sync.write(dst)), x0, y0, w: winW, h: winH };
  } catch (e) {
    console.warn(`[refine] crop failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function refineClickCoords(screenshotBase64: string, x: number, y: number, targetHint?: string): Promise<{ x: number; y: number; adjusted: boolean; confident: boolean }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) return { x, y, adjusted: false, confident: false };
  const ox = Math.round(x);
  const oy = Math.round(y);
  try {
    const bin = atob(screenshotBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const cropped = cropAndAnnotateForRefine(bytes, ox, oy);
    if (!cropped) return { x: ox, y: oy, adjusted: false, confident: false };
    const b64 = toBase64(cropped.png);
    const sysPrompt = `You refine UI click coordinates with sub-pixel precision. The image is a 2x-magnified crop of a desktop region. Green gridlines and labels show SOURCE pixel coordinates. A RED crosshair + circle marks the agent's proposed click point at source (${ox}, ${oy}).

Identify the EXACT CENTER of the intended UI target (button, icon, link, tab, input field, menu item) that the crosshair is aiming at. The crosshair may be slightly off — your job is to correct it.

Respond with ONE JSON object only:
{"x": <integer source x>, "y": <integer source y>, "confident": true|false, "target": "<brief description of element>"}

Rules:
- x,y MUST be the geometric center of the target element (not its edge, not its label).
- If the crosshair is already within ±2 px of the true center, return (${ox}, ${oy}) with confident:true.
- If there is no obvious clickable target near the crosshair, return (${ox}, ${oy}) with confident:false.
- Stay within the visible crop. Do not invent coordinates outside the labeled gridlines.`;
    const resp = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 200,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: [
            { type: "text", text: `Intended target: ${targetHint || "(not specified — infer from crosshair position)"}` },
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
          ]},
        ],
      }),
    });
    if (!resp.ok) {
      console.warn(`[refine] gateway ${resp.status}`);
      return { x: ox, y: oy, adjusted: false, confident: false };
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonStr = extractBalancedJson(content);
    if (!jsonStr) return { x: ox, y: oy, adjusted: false, confident: false };
    const parsed = JSON.parse(jsonStr);
    const nx = Number(parsed.x);
    const ny = Number(parsed.y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return { x: ox, y: oy, adjusted: false, confident: false };
    // Clamp within crop window so the model can't teleport the cursor
    const fx = Math.max(cropped.x0, Math.min(cropped.x0 + cropped.w - 1, Math.round(nx)));
    const fy = Math.max(cropped.y0, Math.min(cropped.y0 + cropped.h - 1, Math.round(ny)));
    const adjusted = fx !== ox || fy !== oy;
    if (adjusted) console.log(`[refine] (${ox},${oy}) → (${fx},${fy}) target=${parsed.target || "?"} confident=${parsed.confident}`);
    return { x: fx, y: fy, adjusted, confident: Boolean(parsed.confident) };
  } catch (e) {
    console.warn(`[refine] failed: ${e instanceof Error ? e.message : String(e)}`);
    return { x: ox, y: oy, adjusted: false, confident: false };
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
  const attempt = async () => {
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
        }) as unknown as BodyInit,
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
  };

  try {
    return await attempt();
  } catch (error) {
    if (!isEnvdAuthError(error)) throw error;
    const refreshed = await connectSandbox(sandbox.sandboxId, true);
    syncSandboxSession(sandbox, refreshed);
    return await attempt();
  }
}

async function readSandboxFile(sandbox: SandboxSession, path: string): Promise<Uint8Array> {
  const attempt = async () => {
    const response = await fetch(`${getEnvdBaseUrl(sandbox.sandboxId)}/files?path=${encodeURIComponent(path)}`, {
      headers: { "X-Access-Token": sandbox.envdAccessToken },
    });
    if (!response.ok) {
      throw new Error(`E2B file download failed [${response.status}]: ${await response.text()}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };

  try {
    return await attempt();
  } catch (error) {
    if (!isEnvdAuthError(error)) throw error;
    const refreshed = await connectSandbox(sandbox.sandboxId, true);
    syncSandboxSession(sandbox, refreshed);
    return await attempt();
  }
}

async function writeSandboxFile(sandbox: SandboxSession, path: string, content: string): Promise<void> {
  const attempt = async () => {
    const form = new FormData();
    form.append("file", new Blob([content], { type: "application/octet-stream" }), path.split("/").pop() || "file");
    const response = await fetch(`${getEnvdBaseUrl(sandbox.sandboxId)}/files?path=${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { "X-Access-Token": sandbox.envdAccessToken },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`E2B file upload failed [${response.status}]: ${await response.text()}`);
    }
  };
  try {
    await attempt();
  } catch (error) {
    if (!isEnvdAuthError(error)) throw error;
    const refreshed = await connectSandbox(sandbox.sandboxId, true);
    syncSandboxSession(sandbox, refreshed);
    await attempt();
  }
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

type EngagementContext = {
  name?: string;
  type?: string;        // bug_bounty | pentest | ctf | personal
  inScope?: string[];
  outOfScope?: string[];
  intensity?: string;   // passive | active | exploitation
  authorized?: boolean;
  allowExploitation?: boolean;
};

function normalizeHost(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
}

function hostMatchesPattern(host: string, pattern: string): boolean {
  const p = normalizeHost(pattern);
  if (!p) return false;
  if (p.startsWith("*.")) {
    const base = p.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === p;
}

function scopeAllowed(url: string, eng?: EngagementContext): { allowed: boolean; reason: string } {
  if (!eng || !eng.inScope || eng.inScope.length === 0) {
    return { allowed: true, reason: "no scope defined" };
  }
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return { allowed: false, reason: "invalid URL" }; }

  for (const p of eng.outOfScope || []) {
    if (hostMatchesPattern(host, p)) return { allowed: false, reason: `'${host}' is explicitly out-of-scope (${p})` };
  }
  for (const p of eng.inScope) {
    if (hostMatchesPattern(host, p)) return { allowed: true, reason: `matches in-scope pattern ${p}` };
  }
  return { allowed: false, reason: `'${host}' is not in the allowed scope` };
}

const DESTRUCTIVE_PATTERNS = [
  /\bDROP\s+TABLE\b/i, /\bDROP\s+DATABASE\b/i, /\bTRUNCATE\s+TABLE\b/i,
  /\bDELETE\s+FROM\b/i, /\brm\s+-rf\s+\//i, /\b:\(\)\{\s*:\|:&\s*\}/,
  /\bshutdown\b|\breboot\b/i, /\bmkfs\b|\bdd\s+if=/i,
];

function isDestructive(text: string): { destructive: boolean; matched?: string } {
  if (!text) return { destructive: false };
  for (const re of DESTRUCTIVE_PATTERNS) {
    if (re.test(text)) return { destructive: true, matched: re.source };
  }
  return { destructive: false };
}

const ALLOWED_ACTIONS = new Set(["click", "double_click", "type", "hotkey", "scroll", "move_mouse", "drag_select", "wait", "open_url", "report_finding", "done"]);

const SCREEN_W = 1024;
const SCREEN_H = 768;
const clampX = (n: number) => Math.max(0, Math.min(SCREEN_W - 1, Math.round(n)));
const clampY = (n: number) => Math.max(0, Math.min(SCREEN_H - 1, Math.round(n)));

function normalizeUrl(value: string): string | null {
  const cleaned = String(value || "").trim().replace(/[),.;]+$/, "");
  if (!cleaned) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractInitialUrl(task: string): string | null {
  const explicit = task.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  const explicitUrl = explicit ? normalizeUrl(explicit) : null;
  if (explicitUrl) return explicitUrl;

  const domainPattern = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>]*)?/gi;
  for (const match of task.matchAll(domainPattern)) {
    const index = match.index ?? 0;
    if (task[index - 1] === "@") continue;
    const url = normalizeUrl(match[0]);
    if (url) return url;
  }
  return null;
}

function extractBalancedJson(input: string): string | null {
  const start = input.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeDecision(value: any): { action: string; params: any; reasoning: string; done: boolean; summary?: string; finding?: any; parseWarning?: string } {
  const rawAction = String(value?.action || (value?.done ? "done" : "wait")).toLowerCase().trim();
  const action = ALLOWED_ACTIONS.has(rawAction) ? rawAction : "wait";
  const params = value?.params && typeof value.params === "object" ? value.params : {};
  const reasoning = String(value?.reasoning || "VISIBLE: Current screen was analyzed. DECISION: Continue safely.").slice(0, 4000);
  const decision = {
    action,
    params,
    reasoning,
    done: Boolean(value?.done) || action === "done",
    summary: typeof value?.summary === "string" ? value.summary : undefined,
    finding: value?.finding,
  };

  if ((action === "click" || action === "double_click" || action === "move_mouse") &&
      (typeof params.x !== "number" || typeof params.y !== "number")) {
    return { action: "wait", params: { seconds: 2 }, reasoning: `${reasoning}\nDECISION: Coordinates were missing, so I am waiting and re-reading the screen instead of clicking blindly.`, done: false, parseWarning: "missing_coordinates" };
  }
  if (action === "click" || action === "double_click" || action === "move_mouse") {
    decision.params.x = clampX(params.x);
    decision.params.y = clampY(params.y);
  }
  if (action === "drag_select") {
    const { x1, y1, x2, y2 } = params || {};
    if (![x1, y1, x2, y2].every((v) => typeof v === "number" && Number.isFinite(v))) {
      return { action: "wait", params: { seconds: 2 }, reasoning: `${reasoning}\nDECISION: drag_select needs x1,y1,x2,y2 — waiting and re-reading instead.`, done: false, parseWarning: "missing_drag_coordinates" };
    }
    const cx1 = clampX(x1), cy1 = clampY(y1), cx2 = clampX(x2), cy2 = clampY(y2);
    const dist = Math.hypot(cx2 - cx1, cy2 - cy1);
    if (dist < 8) {
      return { action: "click", params: { x: cx1, y: cy1, target: params.target }, reasoning: `${reasoning}\nDECISION: drag span <8px — converting to a single click.`, done: false, parseWarning: "drag_collapsed_to_click" };
    }
    decision.params = { x1: cx1, y1: cy1, x2: cx2, y2: cy2, target: params.target };
  }
  if (action === "open_url") {
    const url = normalizeUrl(params.url || "");
    if (!url) return { action: "wait", params: { seconds: 2 }, reasoning: `${reasoning}\nDECISION: URL was invalid, so I am waiting and re-reading the task.`, done: false, parseWarning: "invalid_url" };
    decision.params.url = url;
  }
  if (action === "wait") {
    const seconds = Number(params.seconds);
    decision.params.seconds = Number.isFinite(seconds) ? Math.min(Math.max(seconds, 1), 8) : 2;
  }
  return decision;
}

function parseAiDecision(content: string): ReturnType<typeof normalizeDecision> | null {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const candidates = [cleaned, extractBalancedJson(cleaned)].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      return normalizeDecision(JSON.parse(candidate));
    } catch {}
  }
  return null;
}

async function aiReason(
  screenshotBase64: string,
  task: string,
  actionHistory: { action: string; reasoning: string; params?: any }[],
  userMessage?: string,
  engagement?: EngagementContext,
): Promise<{ action: string; params: any; reasoning: string; done: boolean; summary?: string; finding?: any; parseWarning?: string }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

  // Include compact action+params so the model can SEE its own repetition.
  const recent = actionHistory.slice(-10);
  const fmtParams = (a: any) => {
    if (!a?.params) return "";
    const p = a.params;
    if (a.action === "click" || a.action === "double_click" || a.action === "move_mouse")
      return ` @(${p.x},${p.y})${p.target ? ` "${String(p.target).slice(0, 40)}"` : ""}`;
    if (a.action === "drag_select")
      return ` drag(${p.x1},${p.y1}→${p.x2},${p.y2})${p.target ? ` "${String(p.target).slice(0, 40)}"` : ""}`;
    if (a.action === "type") return ` "${String(p.text || "").slice(0, 60)}"`;
    if (a.action === "open_url") return ` ${p.url || ""}`;
    if (a.action === "hotkey") return ` [${(p.keys || []).join("+")}]`;
    if (a.action === "scroll") return ` ${p.direction || ""} ${p.amount || ""}`;
    if (a.action === "wait") return ` ${p.seconds || ""}s`;
    return "";
  };
  const historyText = recent.length > 0
    ? `\n\nRecent actions (verify the SCREEN, not these labels):\n${recent.map((a, i) => `${i + 1}. ${a.action}${fmtParams(a)}`).join("\n")}`
    : "";

  // Loop / repetition detector
  let loopWarning = "";
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];
  const prev2 = recent[recent.length - 3];
  const sameClick = (a: any, b: any) =>
    a && b && a.action === b.action && /click/.test(a.action) &&
    Math.abs((a.params?.x || 0) - (b.params?.x || 0)) <= 12 &&
    Math.abs((a.params?.y || 0) - (b.params?.y || 0)) <= 12;
  const sameType = (a: any, b: any) =>
    a && b && a.action === "type" && b.action === "type" && (a.params?.text || "") === (b.params?.text || "");
  const isSelectAll = (a: any) =>
    a?.action === "hotkey" && Array.isArray(a?.params?.keys) &&
    a.params.keys.map((k: string) => String(k).toLowerCase()).sort().join("+") === "a+ctrl";
  if ((sameClick(last, prev) && sameClick(prev, prev2)) || (sameType(last, prev) && sameType(prev, prev2))) {
    loopWarning = `\n\n⚠ LOOP DETECTED: you have repeated essentially the same action 3 times. It is NOT working. You MUST change strategy this turn: pick a different x,y (look ±30-80px), scroll to reveal the real target, switch to keyboard (Tab+Enter), or wait 3s for the UI to settle. Do NOT emit the same action again.`;
  } else if (sameClick(last, prev) || sameType(last, prev)) {
    loopWarning = `\n\n⚠ You just repeated the previous action. If the screen did not visibly change, the click missed or the field rejected input. Try a different coordinate, scroll, or use Tab to focus the next field.`;
  } else if (isSelectAll(last) && isSelectAll(prev)) {
    loopWarning = `\n\n⚠ You used Ctrl+A twice. Ctrl+A selects the ENTIRE document/field — if you only need a portion of text (word/line/paragraph), use action 'drag_select' with x1,y1 at the start glyph and x2,y2 at the end glyph instead.`;
  }

  const userIntervention = userMessage ? `\n\nUser intervention message: "${userMessage}"` : "";

  const engagementBlock = engagement ? `

ENGAGEMENT CONTEXT (you are operating as a security tester):
- Engagement: ${engagement.name || "unnamed"} (${engagement.type || "unspecified"})
- Test intensity: ${engagement.intensity || "passive"}
- Exploitation allowed: ${engagement.allowExploitation ? "yes (PoC only — never destructive)" : "NO — passive/active probing only"}
- Authorization on file: ${engagement.authorized ? "yes" : "NO — refuse to test if uncertain"}
- In-scope hosts: ${(engagement.inScope || []).join(", ") || "(none defined)"}
- Out-of-scope hosts: ${(engagement.outOfScope || []).join(", ") || "(none)"}

You MUST:
- Only navigate to URLs whose host is in the in-scope list. The system will block out-of-scope navigation.
- Refuse destructive actions: DROP/DELETE/TRUNCATE SQL, mass email sends, real payments, account deletions, file system wipes.
- Use ONLY proof-of-concept payloads (e.g. <script>alert(1)</script>, ' OR 1=1 --, benign IDOR reads). Never exfiltrate real user data.
- When you discover a vulnerability, emit a "report_finding" action with a structured finding object — do NOT just describe it in reasoning.
` : "";

  const systemPrompt = `You are Emma, a general-purpose computer-use AI agent operating a virtual Linux desktop. You can browse the web, use apps, fill forms, run terminals, and perform any task a human user could do at a desktop.

Your task: ${task}${engagementBlock}${historyText}${loopWarning}${userIntervention}

Respond with exactly one valid JSON object and nothing else. No markdown, no screenshots, no prose outside JSON.
Required shape:
{"reasoning":"VISIBLE: two literal sentences about the current screenshot. DECISION: one sentence explaining the next action.","action":"wait","params":{"seconds":2},"done":false}

Allowed actions and params:
- click/double_click/move_mouse: {"x": number, "y": number, "target": "brief description of element being clicked"}
- drag_select: {"x1": number, "y1": number, "x2": number, "y2": number, "target": "what text/region you are selecting"}
- type: {"text": "string"}
- hotkey: {"keys": ["ctrl","a"]}
- scroll: {"x": number, "y": number, "direction": "up" or "down", "amount": number}
- open_url: {"url": "https://..."}
- wait: {"seconds": 1-8}
- report_finding: params {}, plus top-level finding object
- done: params {}, done true, summary string

Rules:
- THE CURRENT SCREENSHOT IS GROUND TRUTH. Trust ONLY what you can see right now. Ignore any prior reasoning or history that contradicts the pixels on screen.
- VERIFY EVERY ACTION: before taking a new action, check whether the previous action visibly changed the screen. If it didn't, the click missed or the field is invalid — DO NOT repeat it; try a different coordinate, scroll, or keyboard navigation.
- NEVER repeat the exact same click (within ~15px) or the same typed text twice in a row. If a button doesn't respond, the target is wrong — re-locate it.
- TEXT SELECTION:
  - To highlight a SPECIFIC range (a word, a sentence, a paragraph, a code snippet): use 'drag_select' with x1,y1 at the first glyph and x2,y2 at the last glyph. This is mouse-down → drag → mouse-up and works in every editor, browser, and terminal.
  - To select a single word, prefer 'double_click' on it.
  - Use 'hotkey' ctrl+a ONLY when you genuinely want EVERY character in the field/document. Do NOT default to ctrl+a for partial selections.
- REQUIRED FIELDS: before clicking any Submit / Continue / Next / Sign up / Pay button, scan the WHOLE form top-to-bottom. Every field marked with * or "required" (and standard fields like email, password, name, confirm-password, checkboxes for ToS) MUST be filled. If any required field is empty, fill it FIRST. If a validation error appears (red text, red border), fix that field before retrying submit.
- ONE FIELD AT A TIME for typing: click the field → verify cursor/focus indicator appears → type → press Tab to confirm acceptance → move to next field.
- If the screenshot shows the bottom of a page (e.g. footer/sponsor logos), do NOT claim you are looking at a list/menu/header that is not visible — scroll up first.
- If you are unsure what is on screen, your next action should be 'scroll' (to top) or 'wait', not a click based on assumed state.
- Screen is 1024x768. A green coordinate grid is overlaid every 100 pixels with the x,y values printed at each intersection. READ THE GRID to determine exact click coordinates — do NOT guess. Locate the target visually, find the nearest gridline intersections, then interpolate.
- Click coordinates must be the EXACT CENTER of the target element (not its edge, not its label). For small icons aim within ±5 px of center. The grid lines themselves are overlay — ignore them as UI; they are just for measurement.
- DESKTOP ICONS require double_click, not click. A single click only selects them.
- To open any website or web page, ALWAYS use action='open_url' with the full URL. Do NOT try to launch a browser by clicking desktop/taskbar icons — that is unreliable. open_url handles browser launch automatically.
- After open_url, the browser needs ~3-5 seconds to render: follow with action='wait' (seconds: 4) before reasoning about the page.
- After typing into a field, usually press Tab to commit and move on, or Enter only when the form is fully complete.
- Maximum 50 actions per task — wrap up with done=true if you approach the limit.`;


  const requestBody: Record<string, unknown> = {
    model: "google/gemini-2.5-pro",
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Look at this screenshot of the CURRENT desktop and decide the next action. A green coordinate grid (every 100px, with x,y labels at each intersection) is overlaid for precise click measurement — IGNORE the grid as UI; use it ONLY to read the exact x,y of your target. Describe only what you literally see beneath the grid." },
          { type: "image_url", image_url: { url: `data:image/png;base64,${overlayGridBase64(screenshotBase64)}` } },
        ],
      },

    ],
    temperature: 0,
    response_format: { type: "json_object" },
  };

  // Surface loopWarning to caller via parseWarning piggyback handled by caller

  let resp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const err = await resp.text();
    if (/response_format|json_object/i.test(err)) {
      delete requestBody.response_format;
      resp = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      if (resp.ok) {
        const retryData = await resp.json();
        const retryContent = retryData.choices?.[0]?.message?.content || "";
        const retryParsed = parseAiDecision(retryContent);
        const fallback = retryParsed || { action: "wait", params: { seconds: 2 }, reasoning: `VISIBLE: I could not parse the fallback model decision. DECISION: Wait and re-analyze. Raw response starts: ${retryContent.slice(0, 180)}`, done: false, parseWarning: "fallback_unparseable_ai_response" };
        return { ...fallback, loopWarning: loopWarning || undefined };
      }
    }
    throw new Error(`AI reasoning failed: ${err}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "";

  const parsed = parseAiDecision(content);
  if (parsed) return { ...parsed, loopWarning: loopWarning || undefined };

  return {
    action: "wait",
    params: { seconds: 2 },
    reasoning: `VISIBLE: I could not safely parse the model decision from the current screen. DECISION: Wait briefly and re-analyze instead of ending the task. Raw response starts: ${content.slice(0, 180)}`,
    done: false,
    parseWarning: "unparseable_ai_response",
    loopWarning: loopWarning || undefined,
  };
}

// ===== xdotool-based action execution (replaces pyautogui) =====
function buildXdotoolCommand(actionType: string, params: any): { cmd: string; args: string[] } | null {
  switch (actionType) {
    case "click": {
      const x = params.x ?? 512;
      const y = params.y ?? 384;
      // Move, settle briefly so the WM registers hover, then click with clearmodifiers.
      return { cmd: "bash", args: ["-c", `xdotool mousemove --sync ${x} ${y} && sleep 0.08 && xdotool click --clearmodifiers 1`] };
    }
    case "double_click": {
      const x = params.x ?? 512;
      const y = params.y ?? 384;
      return { cmd: "bash", args: ["-c", `xdotool mousemove --sync ${x} ${y} && sleep 0.08 && xdotool click --clearmodifiers --repeat 2 --delay 80 1`] };
    }
    case "move_mouse": {
      return { cmd: "bash", args: ["-c", `xdotool mousemove --sync ${params.x} ${params.y} && sleep 0.05`] };
    }
    case "drag_select": {
      const { x1, y1, x2, y2 } = params;
      // mouse-down at start, drag to end with intermediate settle, mouse-up.
      // Two intermediate moves keep the WM's selection logic happy for long drags.
      const mx = Math.round((x1 + x2) / 2);
      const my = Math.round((y1 + y2) / 2);
      return { cmd: "bash", args: ["-c",
        `xdotool mousemove --sync ${x1} ${y1} && sleep 0.06 ` +
        `&& xdotool mousedown 1 && sleep 0.05 ` +
        `&& xdotool mousemove --sync ${mx} ${my} && sleep 0.04 ` +
        `&& xdotool mousemove --sync ${x2} ${y2} && sleep 0.06 ` +
        `&& xdotool mouseup 1`
      ] };
    }

    case "type": {
      // xdotool type with delay; escape special chars
      const text = (params.text || "").replace(/'/g, "'\\''");
      // For long text, chunk it (smaller chunks + lower per-char delay = faster typing)
      if (text.length > 50) {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += 25) {
          chunks.push(text.slice(i, i + 25));
        }
        const cmds = chunks.map(c => `xdotool type --delay 8 '${c}'`).join(" && ");
        return { cmd: "bash", args: ["-c", cmds] };
      }
      return { cmd: "bash", args: ["-c", `xdotool type --delay 8 '${text}'`] };
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

// ============================================================
// === Background Agent Runner (server-side autonomous loop) ===
// ============================================================
const SUPABASE_URL_BG = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_BG = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const adminDb = () => createClient(SUPABASE_URL_BG, SERVICE_ROLE_BG, { auth: { persistSession: false } });
const PER_INVOCATION_BUDGET_MS = 80_000;
const MAX_STEPS = 250;
const activeRunners = new Set<string>();

async function loadRun(id: string): Promise<any | null> {
  const { data } = await adminDb().from("agent_runs").select("*").eq("id", id).maybeSingle();
  return data;
}
async function patchRun(id: string, patch: Record<string, unknown>) {
  patch.updated_at = new Date().toISOString();
  await adminDb().from("agent_runs").update(patch).eq("id", id);
}
async function appendStep(run: any, step: any) {
  run.steps = [...(run.steps || []), { ...step, t: new Date().toISOString() }];
  run.step_count = run.steps.length;
  await patchRun(run.id, {
    steps: run.steps,
    step_count: run.step_count,
    last_heartbeat: new Date().toISOString(),
    current_screenshot: step.screenshot || run.current_screenshot,
  });
}

async function executeActionForBg(sandbox: SandboxSession, actionType: string, params: any): Promise<{ success: boolean; error?: string; screenshot?: string }> {
  try {
    if (actionType === "open_url") {
      const url = JSON.stringify(params?.url || "");
      const launchChain = `(command -v firefox >/dev/null && firefox --new-window ${url}) || (command -v firefox-esr >/dev/null && firefox-esr --new-window ${url}) || (command -v chromium >/dev/null && chromium --no-sandbox --new-window ${url}) || (command -v chromium-browser >/dev/null && chromium-browser --no-sandbox --new-window ${url}) || xdg-open ${url}`;
      await runCommand(sandbox, "bash", ["-c", `nohup setsid bash -c ${JSON.stringify(launchChain)} >/tmp/browser-launch.log 2>&1 </dev/null & disown; sleep 0.3`], 8);
      await new Promise((r) => setTimeout(r, 2500));
    } else if (actionType === "wait") {
      const s = Math.max(1, Math.min(10, Number(params?.seconds || 2)));
      await new Promise((r) => setTimeout(r, s * 1000));
    } else {
      // Refine click/move coords if present
      if ((actionType === "click" || actionType === "double_click" || actionType === "move_mouse") &&
          typeof params?.x === "number" && typeof params?.y === "number") {
        try {
          const { base64: pre } = await captureScreenshotData(sandbox);
          const refined = await refineClickCoords(pre, params.x, params.y, params?.target || params?.hint);
          if (refined.adjusted) { params.x = refined.x; params.y = refined.y; }
        } catch { /* best effort */ }
      }
      const cmd = buildXdotoolCommand(actionType, params);
      if (cmd) {
        const r = await runCommand(sandbox, cmd.cmd, cmd.args, 15);
        if (r.exitCode !== 0) {
          return { success: false, error: r.stderr || r.stdout || "command failed" };
        }
      }
    }
    await new Promise((r) => setTimeout(r, 500));
    try {
      const { base64 } = await captureScreenshotData(sandbox);
      return { success: true, screenshot: base64 };
    } catch {
      return { success: true };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Lightweight sandbox keepalive — resets E2B idle timer with near-zero cost.
async function pingSandbox(sandbox: SandboxSession): Promise<void> {
  try { await runCommand(sandbox, "true", [], 3); } catch { /* ignore */ }
}

// Best-effort active-tab URL probe. Reads the focused window title (Firefox/Chromium
// set it to "<Page Title> — <Browser>") and falls back to parsing any http(s) URL
// from the active window. Returns null if nothing usable is found.
async function probeActiveUrl(sandbox: SandboxSession): Promise<string | null> {
  try {
    const r = await runCommand(sandbox, "bash", [
      "-c",
      "xdotool getactivewindow getwindowname 2>/dev/null || true",
    ], 4);
    const title = (r.stdout || "").trim();
    if (!title) return null;
    const m = title.match(/https?:\/\/[^\s)"']+/);
    if (m) return m[0];
    return null;
  } catch { return null; }
}

const MAX_RESTORES = 5;

async function runBackground(runId: string): Promise<void> {
  if (activeRunners.has(runId)) return;
  activeRunners.add(runId);
  const deadline = Date.now() + PER_INVOCATION_BUDGET_MS;
  console.log(`[bg ${runId.slice(0, 8)}] resume`);
  try {
    let run = await loadRun(runId);
    if (!run) return;
    if (run.status === "done" || run.status === "stopped" || run.status === "error") return;

    // Bootstrap sandbox if missing
    if (!run.session_id) {
      await patchRun(runId, { status: "starting", last_heartbeat: new Date().toISOString() });
      try {
        const sb = await createSandbox(run.user_id, run.task);
        await patchRun(runId, { session_id: sb.sandboxId, envd_token: sb.envdAccessToken });
        await appendStep(run, { action: "create_sandbox", reasoning: `Sandbox created (${sb.sandboxId.slice(0, 8)}...)`, status: "done" });
        run.session_id = sb.sandboxId; run.envd_token = sb.envdAccessToken;
        kickstartDesktop(sb).catch(() => {});
        const ready = await waitForDesktopReady(sb);
        if (!ready.ready) {
          await appendStep(run, { action: "boot_desktop", reasoning: `Boot failed: ${ready.errorCode || "unknown"}`, status: "error" });
          await patchRun(runId, { status: "error", error: `boot_failed:${ready.errorCode || ""}`, ended_at: new Date().toISOString() });
          return;
        }
        await appendStep(run, { action: "boot_desktop", reasoning: `Desktop ready (${Math.ceil(ready.waitedMs / 1000)}s)`, status: "done", screenshot: ready.screenshot });
      } catch (e) {
        await patchRun(runId, { status: "error", error: `start_failed: ${e instanceof Error ? e.message : String(e)}`, ended_at: new Date().toISOString() });
        return;
      }
    }
    await patchRun(runId, { status: "running", last_heartbeat: new Date().toISOString() });

    while (Date.now() < deadline) {
      run = await loadRun(runId);
      if (!run) return;
      if (run.status === "stopped" || run.status === "done" || run.status === "error") return;
      if ((run.step_count || 0) >= MAX_STEPS) {
        await patchRun(runId, { status: "error", error: "max_steps_reached", ended_at: new Date().toISOString() });
        return;
      }

      // Acquire sandbox (recreate on failure + restore from snapshot if possible)
      let sandbox: SandboxSession;
      let justRestored = false;
      try {
        sandbox = await getSandbox(run.session_id, run.envd_token);
      } catch {
        // Cap restores so a broken page can't loop forever.
        if ((run.restore_count || 0) >= MAX_RESTORES) {
          await patchRun(runId, {
            status: "error",
            error: `max_restores_reached (${MAX_RESTORES})`,
            ended_at: new Date().toISOString(),
          });
          return;
        }
        try {
          const sb = await createSandbox(run.user_id, run.task);
          kickstartDesktop(sb).catch(() => {});
          await waitForDesktopReady(sb);
          const newRestoreCount = (run.restore_count || 0) + 1;
          const restoreUrl = run.last_url as string | null;
          // Reset action_history but seed it with the restore step so the AI
          // doesn't repeat the very first open_url and lose the user's progress.
          run.session_id = sb.sandboxId;
          run.envd_token = sb.envdAccessToken;
          run.action_history = restoreUrl
            ? [{ action: "open_url", params: { url: restoreUrl }, reasoning: "Restored from snapshot." }]
            : [];
          run.restore_count = newRestoreCount;
          await patchRun(runId, {
            session_id: sb.sandboxId,
            envd_token: sb.envdAccessToken,
            action_history: run.action_history,
            restore_count: newRestoreCount,
          });
          await appendStep(run, {
            action: "sandbox_recreated",
            reasoning: restoreUrl
              ? `Sandbox expired — recreated and restoring to ${restoreUrl} (restore #${newRestoreCount}/${MAX_RESTORES}).`
              : `Sandbox expired — recreated from scratch (restore #${newRestoreCount}/${MAX_RESTORES}).`,
            status: "done",
            guardrail: `restored_from_snapshot:${newRestoreCount}`,
          });
          // Replay the URL immediately so the model resumes mid-task instead of a blank desktop.
          if (restoreUrl) {
            await executeActionForBg(sb, "open_url", { url: restoreUrl });
            await new Promise((r) => setTimeout(r, 3500));
          }
          sandbox = sb;
          justRestored = true;
        } catch {
          await patchRun(runId, { last_heartbeat: new Date().toISOString() });
          return; // try again next tick
        }
      }

      // Keepalive ping — prevents E2B from idling out mid-task.
      pingSandbox(sandbox).catch(() => {});

      // Snapshot
      let shot = "";
      try { shot = (await captureScreenshotData(sandbox)).base64; }
      catch { await new Promise((r) => setTimeout(r, 1500)); continue; }

      // Decide
      const history = (run.action_history || []) as any[];
      const initialUrl = extractInitialUrl(run.task);
      let decision: any;
      if (justRestored) {
        // Right after restore, just observe the page first.
        decision = { action: "wait", params: { seconds: 2 }, reasoning: "Settling after sandbox restore.", done: false };
      } else if (initialUrl && !history.some((h) => h?.action === "open_url")) {
        decision = { action: "open_url", params: { url: initialUrl }, reasoning: `Opening initial URL ${initialUrl}.`, done: false };
      } else if (history[history.length - 1]?.action === "open_url") {
        decision = { action: "wait", params: { seconds: 4 }, reasoning: "Waiting for page to load.", done: false };
      } else {
        try {
          decision = await aiReason(shot, run.task, history, undefined, run.engagement);
        } catch (e) {
          await appendStep(run, { action: "think_error", reasoning: e instanceof Error ? e.message : String(e), status: "error", screenshot: shot });
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
      }

      await appendStep(run, { action: `think → ${decision.action}`, reasoning: decision.reasoning, status: "done", screenshot: shot, params: decision.params });
      history.push({ action: decision.action, reasoning: decision.reasoning, params: decision.params });
      await patchRun(runId, { action_history: history });

      if (decision.done) {
        await patchRun(runId, { status: "done", summary: decision.summary || "Task completed.", ended_at: new Date().toISOString() });
        return;
      }

      if (decision.action !== "wait") {
        const exec = await executeActionForBg(sandbox, decision.action, decision.params || {});
        await appendStep(run, {
          action: decision.action,
          reasoning: exec.success ? `${decision.action} executed` : `failed: ${exec.error}`,
          status: exec.success ? "done" : "error",
          screenshot: exec.screenshot,
          params: decision.params,
        });
      } else {
        const s = Math.max(1, Math.min(10, Number(decision.params?.seconds || 2)));
        await new Promise((r) => setTimeout(r, s * 1000));
      }

      // Probe + persist current page URL so we can restore after sandbox death.
      try {
        const url = await probeActiveUrl(sandbox);
        if (url && url !== run.last_url) {
          const tabs = Array.isArray(run.tab_urls) ? run.tab_urls : [];
          const nextTabs = tabs.includes(url) ? tabs : [...tabs.slice(-9), url];
          await patchRun(runId, { last_url: url, tab_urls: nextTabs });
          run.last_url = url; run.tab_urls = nextTabs;
        }
      } catch { /* best effort */ }

      await patchRun(runId, { last_heartbeat: new Date().toISOString() });
    }
    // Budget exhausted — leave status=running; cron will resume.
    await patchRun(runId, { last_heartbeat: new Date().toISOString() });
    console.log(`[bg ${runId.slice(0, 8)}] yield (budget)`);
  } catch (e) {
    console.error(`[bg ${runId.slice(0, 8)}] crash`, e);
    try { await patchRun(runId, { status: "error", error: e instanceof Error ? e.message : String(e), ended_at: new Date().toISOString() }); } catch {}
  } finally {
    activeRunners.delete(runId);
  }
}

serve(async (req) => {

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const traceId = req.headers.get("x-trace-id") || crypto.randomUUID();

  const apiKey = Deno.env.get("E2B_API_KEY");
  if (!apiKey) return json({ error: "E2B_API_KEY not configured" }, 500);

  try {
    const body = await req.json();
    const { action } = body;
    const idempotencyKey = req.headers.get("Idempotency-Key") || body.idempotencyKey;
    console.log(`[emma-cu] action=${action} trace=${traceId}`);

    // === Cron-protected background tick (no user auth) ===
    if (action === "bg_tick") {
      const provided = body.secret || req.headers.get("x-cron-secret");
      const { data: secretRow } = await adminDb()
        .from("cron_secrets").select("secret").eq("name", "emma-cu-bg").maybeSingle();
      const expected = secretRow?.secret || Deno.env.get("CRON_SECRET");
      if (!provided || !expected || provided !== expected) return json({ error: "unauthorized" }, 401);
      const cutoff = new Date(Date.now() - 30_000).toISOString();
      const { data } = await adminDb()
        .from("agent_runs").select("id")
        .in("status", ["running", "starting"])
        .lt("last_heartbeat", cutoff)
        .limit(10);
      const ids = (data || []).map((r: any) => r.id);
      for (const id of ids) {
        // @ts-ignore — EdgeRuntime is available in Supabase runtime
        try { EdgeRuntime.waitUntil(runBackground(id)); } catch { runBackground(id); }
      }
      return json({ resumed: ids, traceId });
    }


    const userId = await getClerkUserId(req);
    if (!userId) return json({ error: "Unauthorized — sign in required", traceId }, 401);
    const idemScope = `${userId}:${action}:${idempotencyKey || ""}`;
    if (idempotencyKey) {
      const cached = idempotencyCache.get(idemScope);
      if (cached && cached.expiresAt > Date.now()) {
        return json({ ...(cached.response as Record<string, unknown>), idempotency: { replayed: true, key: idempotencyKey }, traceId });
      }
    }

    if (idempotencyKey) {
      const cached = idempotencyCache.get(idemScope);
      if (cached && cached.expiresAt > Date.now()) {
        return json({ ...(cached.response as Record<string, unknown>), idempotency: { replayed: true, key: idempotencyKey }, traceId });
      }
    }

    switch (action) {
      case "debug_metrics": {
        const metrics: Record<string, any> = {};
        for (const [tool, m] of toolMetrics.entries()) {
          metrics[tool] = {
            calls: m.calls,
            failures: m.failures,
            degraded: m.degraded,
            failureRate: m.calls ? Number((m.failures / m.calls).toFixed(3)) : 0,
            avgLatencyMs: m.calls ? Math.round(m.latencyTotalMs / m.calls) : 0,
          };
        }
        const circuits: Record<string, any> = {};
        for (const [tool, c] of toolCircuits.entries()) {
          circuits[tool] = { failures: c.failures, open: c.openUntil > Date.now(), openUntil: c.openUntil };
        }
        return json({ metrics, circuits, sandboxes: sandboxCache.size, idempotencyCache: idempotencyCache.size, traceId });
      }

      case "start_session": {
        console.log("[emma-cu] Creating sandbox...");
        const sandbox = await reliableToolCall("create_sandbox", traceId, () => createSandbox(userId, body.task), 30_000);
        console.log(`[emma-cu] Sandbox created: ${sandbox.sandboxId}`);

        // Fire-and-forget: start desktop in background, don't await
        kickstartDesktop(sandbox).catch((e) =>
          console.error(`[emma-cu] Background kickstart failed: ${e}`)
        );

        return json({
          sessionId: sandbox.sandboxId,
          envdAccessToken: sandbox.envdAccessToken,
          status: "created",
          traceId,
        });
      }

      case "screenshot": {
        const { sessionId, envdAccessToken } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        try {
          const sandbox = await reliableToolCall("get_sandbox", traceId, () => getSandbox(sessionId, envdAccessToken));
          const { base64: screenshot, analysis } = await reliableToolCall("capture_screenshot", traceId, () => captureScreenshotData(sandbox));
          return json({ screenshot, analysis, traceId });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Screenshot unavailable";
          return json({ error: msg, status: "screenshot_failed" }, 503);
        }
      }

      case "wait_until_ready": {
        const { sessionId, envdAccessToken } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        const sandbox = await reliableToolCall("get_sandbox", traceId, () => getSandbox(sessionId, envdAccessToken));
        console.log(`[emma-cu] wait_until_ready for ${sessionId}`);
        const readiness = await reliableToolCall("wait_until_ready", traceId, () => waitForDesktopReady(sandbox), 95_000);
        console.log(`[emma-cu] readiness: ready=${readiness.ready} code=${readiness.errorCode || "ok"} stage=${readiness.stage} waited=${readiness.waitedMs}ms`);

        return readiness.ready
          ? json({ ...readiness, status: "ready", traceId })
          : json({ ...readiness, status: "boot_failed", traceId }, 408);
      }

      case "execute": {
        const { sessionId, actionType, params, envdAccessToken, engagement } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        const sandbox = await reliableToolCall("get_sandbox", traceId, () => getSandbox(sessionId, envdAccessToken));
        let result: any = { success: true };

        // === Scope guardrail: block out-of-scope navigation ===
        if (actionType === "open_url") {
          const scope = scopeAllowed(params?.url || "", engagement);
          if (!scope.allowed) {
            try { const { base64 } = await captureScreenshotData(sandbox); result.screenshot = base64; } catch {}
            return json({
              success: false,
              blocked: true,
              error: `Scope violation — ${scope.reason}`,
              guardrail: "scope",
              ...result,
            });
          }
          // Launch a browser fully detached. Previous version only backgrounded
          // the final `xdg-open` due to `&` precedence — firefox/chromium would
          // run in the foreground and block. We now wrap the entire chain in a
          // subshell with nohup+setsid so the command returns immediately and
          // the browser process survives.
          const url = JSON.stringify(params.url);
          const launchChain = `(command -v firefox >/dev/null && firefox --new-window ${url}) \
|| (command -v firefox-esr >/dev/null && firefox-esr --new-window ${url}) \
|| (command -v google-chrome >/dev/null && google-chrome --no-sandbox --new-window ${url}) \
|| (command -v chromium >/dev/null && chromium --no-sandbox --new-window ${url}) \
|| (command -v chromium-browser >/dev/null && chromium-browser --no-sandbox --new-window ${url}) \
|| xdg-open ${url}`;
          await runCommand(
            sandbox, "bash",
            ["-c", `nohup setsid bash -c ${JSON.stringify(launchChain)} >/tmp/browser-launch.log 2>&1 </dev/null & disown; sleep 0.3`],
            8,
          );
          // Give the browser a head start before the agent's next think/screenshot.
          await new Promise((r) => setTimeout(r, 2500));

        } else if (actionType === "wait") {
          result = { success: true, waited: params.seconds || 2 };
        } else if (actionType === "type") {
          // === Destructive payload guard ===
          const dest = isDestructive(params?.text || "");
          if (dest.destructive && !engagement?.allowExploitation) {
            try { const { base64 } = await captureScreenshotData(sandbox); result.screenshot = base64; } catch {}
            return json({
              success: false,
              blocked: true,
              error: `Destructive payload blocked (matched: ${dest.matched}). Enable "Allow exploitation" in engagement settings to bypass.`,
              guardrail: "destructive_payload",
              ...result,
            });
          }
          const xdoCmd = buildXdotoolCommand(actionType, params);
          if (xdoCmd) {
            try {
              const cmdResult = await reliableToolCall("execute_action", traceId, () => runCommand(sandbox, xdoCmd.cmd, xdoCmd.args, 15), 20_000);
              if (cmdResult.exitCode !== 0) {
                result = { success: false, error: cmdResult.stderr || cmdResult.stdout || "Command failed" };
              }
            } catch (e) {
              result = { success: false, error: e instanceof Error ? e.message : "Command execution failed" };
            }
          }
        } else {
          // === Click refinement: zoom + re-center before clicking for sub-pixel accuracy ===
          if ((actionType === "click" || actionType === "double_click" || actionType === "move_mouse") &&
              typeof params?.x === "number" && typeof params?.y === "number") {
            try {
              const { base64: preShot } = await reliableToolCall("refine_screenshot", traceId, () => captureScreenshotData(sandbox), 12_000);
              const refined = await reliableToolCall("refine_click", traceId,
                () => refineClickCoords(preShot, params.x, params.y, params?.target || params?.element || params?.hint),
                10_000,
              );
              if (refined.adjusted) {
                result.refinement = { from: { x: params.x, y: params.y }, to: { x: refined.x, y: refined.y }, confident: refined.confident };
                params.x = refined.x;
                params.y = refined.y;
              }
            } catch (e) {
              console.warn(`[refine] skipped: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          // === Drag-select endpoint refinement ===
          if (actionType === "drag_select" &&
              typeof params?.x1 === "number" && typeof params?.y1 === "number" &&
              typeof params?.x2 === "number" && typeof params?.y2 === "number") {
            try {
              const { base64: preShot } = await reliableToolCall("refine_screenshot", traceId, () => captureScreenshotData(sandbox), 12_000);
              const hint = params?.target ? `start of: ${params.target}` : "start of selection";
              const hint2 = params?.target ? `end of: ${params.target}` : "end of selection";
              const [r1, r2] = await Promise.all([
                reliableToolCall("refine_drag_start", traceId, () => refineClickCoords(preShot, params.x1, params.y1, hint), 10_000),
                reliableToolCall("refine_drag_end", traceId, () => refineClickCoords(preShot, params.x2, params.y2, hint2), 10_000),
              ]);
              const adjusted = r1.adjusted || r2.adjusted;
              if (adjusted) {
                result.refinement = {
                  from: { x1: params.x1, y1: params.y1, x2: params.x2, y2: params.y2 },
                  to: { x1: r1.x, y1: r1.y, x2: r2.x, y2: r2.y },
                };
                params.x1 = r1.x; params.y1 = r1.y; params.x2 = r2.x; params.y2 = r2.y;
              }
            } catch (e) {
              console.warn(`[refine drag] skipped: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          console.log(`[action] ${actionType} params=${JSON.stringify(params).slice(0, 200)} trace=${traceId}`);
          const xdoCmd = buildXdotoolCommand(actionType, params);
          if (xdoCmd) {
            const t0 = Date.now();
            try {
              const cmdResult = await reliableToolCall("execute_action", traceId, () => runCommand(sandbox, xdoCmd.cmd, xdoCmd.args, 15), 20_000);
              console.log(`[action] ${actionType} exit=${cmdResult.exitCode} latency=${Date.now() - t0}ms`);
              if (cmdResult.exitCode !== 0) {
                result = { success: false, error: cmdResult.stderr || cmdResult.stdout || "Command failed" };
              }
            } catch (e) {
              result = { success: false, error: e instanceof Error ? e.message : "Command execution failed" };
            }
          }
        }

        // Always capture a post-action screenshot so frontend stays in sync
        try {
          await new Promise((r) => setTimeout(r, 500));
          const { base64: screenshot } = await reliableToolCall("capture_screenshot", traceId, () => captureScreenshotData(sandbox), 15_000);
          result.screenshot = screenshot;
        } catch (e) {
          console.warn(`[execute] post-action screenshot failed: ${e}`);
        }

        const payload = { ...result, traceId, idempotency: { replayed: false, key: idempotencyKey || null } };
        if (idempotencyKey) idempotencyCache.set(idemScope, { response: payload, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
        return json(payload);
      }

      case "recon": {
        const { sessionId, envdAccessToken, tool, target, engagement } = body;
        if (!sessionId || !tool || !target) return json({ error: "Missing sessionId/tool/target" }, 400);

        const urlTarget = target.startsWith("http") ? target : `https://${target}`;
        if (tool !== "dns_lookup" && tool !== "whois") {
          const scope = scopeAllowed(urlTarget, engagement);
          if (!scope.allowed) return json({ error: `Scope violation — ${scope.reason}`, guardrail: "scope" }, 403);
        }

        const sandbox = await reliableToolCall("get_sandbox", traceId, () => getSandbox(sessionId, envdAccessToken));
        const safe = JSON.stringify(target);
        const safeUrl = JSON.stringify(urlTarget);
        let cmd = "";
        switch (tool) {
          case "dns_lookup":       cmd = `dig +short ${safe} ANY 2>&1 || host ${safe}`; break;
          case "whois":            cmd = `whois ${safe} 2>&1 | head -60`; break;
          case "http_headers":     cmd = `curl -sSI --max-time 15 ${safeUrl}`; break;
          case "robots_txt":       cmd = `curl -sS --max-time 10 ${safeUrl}/robots.txt | head -100`; break;
          case "sitemap_fetch":    cmd = `curl -sS --max-time 10 ${safeUrl}/sitemap.xml | head -200`; break;
          case "tech_fingerprint": cmd = `curl -sSI --max-time 15 ${safeUrl} | grep -iE 'server|x-powered-by|x-aspnet|x-generator|via'`; break;
          default: return json({ error: `Unknown recon tool: ${tool}` }, 400);
        }
        try {
          const r = await reliableToolCall("recon_tool", traceId, () => runCommand(sandbox, "bash", ["-c", cmd], 25), 30_000);
          return json({ tool, target, output: (r.stdout + (r.stderr ? `\n[stderr]\n${r.stderr}` : "")).slice(0, 4000), exitCode: r.exitCode, traceId });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Recon failed" }, 500);
        }
      }

      case "http_capture": {
        const { sessionId, envdAccessToken, url, method = "GET", headers = {}, requestBody, engagement } = body;
        if (!sessionId || !url) return json({ error: "Missing sessionId/url" }, 400);
        const scope = scopeAllowed(url, engagement);
        if (!scope.allowed) return json({ error: `Scope violation — ${scope.reason}`, guardrail: "scope" }, 403);

        const sandbox = await reliableToolCall("get_sandbox", traceId, () => getSandbox(sessionId, envdAccessToken));
        const headerArgs = Object.entries(headers as Record<string, string>)
          .map(([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`).join(" ");
        const bodyArg = requestBody ? `--data ${JSON.stringify(requestBody)}` : "";
        const cmd = `curl -sS -i -X ${JSON.stringify(method)} --max-time 25 ${headerArgs} ${bodyArg} ${JSON.stringify(url)}`;
        try {
          const r = await reliableToolCall("http_capture", traceId, () => runCommand(sandbox, "bash", ["-c", cmd], 30), 35_000);
          const raw = r.stdout || r.stderr || "";
          const splitIdx = raw.indexOf("\r\n\r\n");
          const responseHeaders = splitIdx >= 0 ? raw.slice(0, splitIdx) : raw;
          const responseBody = splitIdx >= 0 ? raw.slice(splitIdx + 4) : "";
          const requestText = `${method} ${url}\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\n")}${requestBody ? `\n\n${requestBody}` : ""}`;
          return json({ url, method, request: requestText, responseHeaders, responseBody: responseBody.slice(0, 4000), traceId });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Capture failed" }, 500);
        }
      }

      case "keepalive": {
        const { sessionId, envdAccessToken } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        try {
          // Try extending the existing sandbox timeout
          await e2bApi(`/sandboxes/${sessionId}/timeout`, {
            method: "POST",
            body: JSON.stringify({ timeout: 300 }),
          });
          console.log(`[keepalive] Extended timeout for ${sessionId}`);
          return json({ status: "extended", sessionId, traceId });
        } catch (extendError) {
          console.warn(`[keepalive] Extend failed for ${sessionId}, recreating sandbox...`, extendError);
          // Sandbox is dead — create a new one
          try {
            const cached = sandboxCache.get(sessionId);
            sandboxCache.delete(sessionId);
            const newSandbox = await createSandbox(userId, body.task || "recovery");
            await kickstartDesktop(newSandbox);
            // Wait briefly for desktop
            await new Promise((r) => setTimeout(r, 3000));
            console.log(`[keepalive] Recreated sandbox: ${newSandbox.sandboxId}`);
            return json({
              status: "recreated",
              sessionId: newSandbox.sandboxId,
              envdAccessToken: newSandbox.envdAccessToken,
              traceId,
            });
          } catch (recreateError) {
            const msg = recreateError instanceof Error ? recreateError.message : "Recovery failed";
            console.error(`[keepalive] Recreate failed: ${msg}`);
            return json({ error: msg, errorCode: "sandbox_expired" }, 503);
          }
        }
      }

      case "think": {
        const { sessionId, task, actionHistory, userMessage, envdAccessToken, engagement } = body;
        if (!sessionId || !task) return json({ error: "Missing sessionId or task" }, 400);

        const sandbox = await reliableToolCall("get_sandbox", traceId, () => getSandbox(sessionId, envdAccessToken));
        let screenshotBase64 = "";

        try {
          const screenshot = await reliableToolCall("capture_screenshot", traceId, () => captureScreenshotData(sandbox));
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
              traceId,
            });
          }
        } catch (screenshotError) {
          // Attempt token refresh before giving up
          console.warn(`[think] Screenshot failed, attempting token refresh: ${screenshotError}`);
          try {
            const refreshed = await connectSandbox(sandbox.sandboxId, true);
            syncSandboxSession(sandbox, refreshed);
            const retryScreenshot = await reliableToolCall("capture_screenshot", traceId, () => captureScreenshotData(sandbox));
            screenshotBase64 = retryScreenshot.base64;
          } catch (retryError) {
            console.error(`[think] Token refresh also failed: ${retryError}`);
            return json({
              action: "wait",
              params: { seconds: 5 },
              reasoning: "Sandbox connection lost — recovery in progress via keepalive",
              done: false,
              errorCode: "sandbox_expired",
            });
          }
        }

        if (!screenshotBase64) {
          return json({
            action: "wait",
            params: { seconds: 3 },
            reasoning: "Could not capture screenshot, waiting for desktop to load",
            done: false,
          });
        }

        const history = Array.isArray(actionHistory) ? actionHistory : [];
        const initialUrl = extractInitialUrl(task);
        if (initialUrl && !history.some((entry) => entry?.action === "open_url")) {
          return json({
            action: "open_url",
            params: { url: initialUrl },
            reasoning: `VISIBLE: The current desktop is ready for browser automation. DECISION: Open ${initialUrl} directly with the browser launcher before interacting with the page.`,
            done: false,
            screenshot: screenshotBase64,
            traceId,
          });
        }

        // === Speed: short-circuit obvious wait after open_url (skip model call) ===
        const lastEntry = history[history.length - 1];
        if (lastEntry?.action === "open_url") {
          return json({
            action: "wait",
            params: { seconds: 4 },
            reasoning: `VISIBLE: A browser was just launched and the page is still loading. DECISION: Wait 4s for first paint before reasoning about page contents (deterministic short-circuit — no model call).`,
            done: false,
            screenshot: screenshotBase64,
            traceId,
          });
        }


        const decision = await reliableToolCall("ai_reason", traceId, () => aiReason(screenshotBase64, task, history, userMessage, engagement), 40_000);
        const m = toolMetrics.get("ai_reason");
        const calls = m?.calls || 0;
        const reliability = {
          tracing: { enabled: true, traceId },
          idempotency: { enabled: true, exactOnce: "best_effort_per_key", ttlMs: IDEMPOTENCY_TTL_MS },
          sloDashboard: {
            latencyMsP50: calls ? Math.round((m?.latencyTotalMs || 0) / calls) : 0,
            failureRate: calls ? Number(((m?.failures || 0) / calls).toFixed(3)) : 0,
            degradedModeRate: calls ? Number(((m?.degraded || 0) / calls).toFixed(3)) : 0,
          },
          chaosScenarios: [
            { name: "sandbox_disconnect", recoveryAssertion: "token refresh and keepalive recreate session" },
            { name: "black_screen_startup", recoveryAssertion: "wait action returned until meaningful frame" },
          ],
        };
        return json({ ...decision, screenshot: screenshotBase64, reliability, traceId });
      }

      case "shell_exec": {
        const { sessionId, envdAccessToken, command, cwd, timeout } = body;
        if (!sessionId || !command) return json({ error: "Missing sessionId/command" }, 400);
        const sandbox = await reliableToolCall("get_sandbox", traceId, () => getSandbox(sessionId, envdAccessToken));
        const wrapped = cwd ? `cd ${JSON.stringify(cwd)} && ${command}` : command;
        const r = await reliableToolCall(
          "shell_exec",
          traceId,
          () => runCommand(sandbox, "bash", ["-lc", wrapped], Math.min(Math.max(timeout || 30, 1), 120)),
          (Math.min(Math.max(timeout || 30, 1), 120) + 10) * 1000,
        );
        return json({ exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, traceId });
      }

      case "fs_read": {
        const { sessionId, envdAccessToken, path } = body;
        if (!sessionId || !path) return json({ error: "Missing sessionId/path" }, 400);
        const sandbox = await reliableToolCall("get_sandbox", traceId, () => getSandbox(sessionId, envdAccessToken));
        const bytes = await reliableToolCall("fs_read", traceId, () => readSandboxFile(sandbox, path));
        return json({ content: new TextDecoder().decode(bytes), traceId });
      }

      case "fs_write": {
        const { sessionId, envdAccessToken, path, content } = body;
        if (!sessionId || !path) return json({ error: "Missing sessionId/path" }, 400);
        const sandbox = await reliableToolCall("get_sandbox", traceId, () => getSandbox(sessionId, envdAccessToken));
        await reliableToolCall("fs_write", traceId, () => writeSandboxFile(sandbox, path, content || ""));
        return json({ success: true, traceId });
      }

      case "sync_project": {
        const { sessionId, envdAccessToken, projectName, files } = body;
        if (!sessionId || !files) return json({ error: "Missing sessionId/files" }, 400);
        const sandbox = await reliableToolCall("get_sandbox", traceId, () => getSandbox(sessionId, envdAccessToken));
        const projectDir = `/home/user/${(projectName || "project").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        await runCommand(sandbox, "bash", ["-lc", `mkdir -p ${JSON.stringify(projectDir)} && rm -rf ${JSON.stringify(projectDir)}/* 2>/dev/null || true`], 10);
        for (const f of files as { path: string; content: string }[]) {
          const dir = `${projectDir}/${f.path.split("/").slice(0, -1).join("/")}`;
          if (dir !== projectDir) await runCommand(sandbox, "bash", ["-lc", `mkdir -p ${JSON.stringify(dir)}`], 5);
          await writeSandboxFile(sandbox, `${projectDir}/${f.path}`, f.content);
        }
        return json({ success: true, projectDir, fileCount: files.length, traceId });
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
        return json({ success: true, status: "destroyed", traceId });
      }

      // ============================================================
      // === Background-run lifecycle (survive browser close) =======
      // ============================================================
      case "start_run": {
        const task = String(body.task || "").trim();
        if (!task) return json({ error: "Missing task" }, 400);
        const db = adminDb();
        // 1 active run per user
        const { data: existing } = await db
          .from("agent_runs").select("id")
          .eq("user_id", userId).in("status", ["starting", "running"])
          .limit(1).maybeSingle();
        if (existing) return json({ runId: existing.id, status: "already_running", traceId });

        const { data: row, error } = await db
          .from("agent_runs")
          .insert({ user_id: userId, task, engagement: body.engagement || {}, status: "starting" })
          .select("id").single();
        if (error || !row) return json({ error: error?.message || "Failed to create run" }, 500);

        // @ts-ignore
        try { EdgeRuntime.waitUntil(runBackground(row.id)); } catch { runBackground(row.id); }
        return json({ runId: row.id, status: "starting", traceId });
      }

      case "get_run": {
        const id = body.runId;
        if (!id) return json({ error: "Missing runId" }, 400);
        const sinceStep = Number(body.sinceStep || 0);
        const { data } = await adminDb().from("agent_runs").select("*").eq("id", id).maybeSingle();
        if (!data || data.user_id !== userId) return json({ error: "Not found" }, 404);
        const allSteps = (data.steps || []) as any[];
        const newSteps = sinceStep > 0 ? allSteps.slice(sinceStep) : allSteps;
        return json({
          run: {
            id: data.id, task: data.task, status: data.status,
            step_count: data.step_count, summary: data.summary, error: data.error,
            current_screenshot: data.current_screenshot,
            started_at: data.started_at, ended_at: data.ended_at,
            last_heartbeat: data.last_heartbeat,
            restore_count: data.restore_count || 0,
            last_url: data.last_url || null,
          },
          newSteps,
          traceId,
        });
      }

      case "list_runs": {
        const { data } = await adminDb()
          .from("agent_runs")
          .select("id, task, status, step_count, summary, started_at, ended_at, last_heartbeat")
          .eq("user_id", userId)
          .order("started_at", { ascending: false })
          .limit(20);
        return json({ runs: data || [], traceId });
      }

      case "stop_run": {
        const id = body.runId;
        if (!id) return json({ error: "Missing runId" }, 400);
        const db = adminDb();
        const { data } = await db.from("agent_runs").select("user_id, session_id").eq("id", id).maybeSingle();
        if (!data || data.user_id !== userId) return json({ error: "Not found" }, 404);
        await db.from("agent_runs").update({ status: "stopped", ended_at: new Date().toISOString() }).eq("id", id);
        if (data.session_id) {
          try { await fetch(`${E2B_API_BASE}/sandboxes/${data.session_id}`, { method: "DELETE", headers: { "X-API-Key": apiKey } }); } catch {}
        }
        return json({ ok: true, traceId });
      }

      case "nudge_run": {
        const id = body.runId;
        if (!id) return json({ error: "Missing runId" }, 400);
        const { data } = await adminDb().from("agent_runs").select("user_id, status").eq("id", id).maybeSingle();
        if (!data || data.user_id !== userId) return json({ error: "Not found" }, 404);
        if (data.status === "running" || data.status === "starting") {
          // @ts-ignore
          try { EdgeRuntime.waitUntil(runBackground(id)); } catch { runBackground(id); }
        }
        return json({ ok: true, traceId });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);

    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const code = message.includes("CIRCUIT_OPEN") ? "CIRCUIT_OPEN" : message.includes("TOOL_TIMEOUT") ? "TOOL_TIMEOUT" : "INTERNAL_ERROR";
    console.error("[emma-computer-use][error]", { code, message, traceId });
    return json({ error: message, structuredError: { code, retryable: code !== "INTERNAL_ERROR", traceId }, traceId }, 500);
  }
});

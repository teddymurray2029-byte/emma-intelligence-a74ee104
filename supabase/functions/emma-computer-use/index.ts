import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const E2B_API = "https://api.e2b.app";
const DESKTOP_BOOT_TIMEOUT_MS = 45_000;
const DESKTOP_BOOT_POLL_MS = 2_000;

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

// E2B REST API helpers
function getApiKey(): string {
  const apiKey = Deno.env.get("E2B_API_KEY");
  if (!apiKey) throw new Error("E2B_API_KEY not configured");
  return apiKey;
}

async function e2bApi(path: string, method = "GET", body?: any) {
  const apiKey = getApiKey();
  const resp = await fetch(`${E2B_API}${path}`, {
    method,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`E2B API error ${resp.status}: ${err}`);
  }
  if (resp.status === 204) return {};
  return resp.json();
}

// Run a command inside the sandbox via envd Connect protocol
async function runCommand(sandboxId: string, envdAccessToken: string, cmd: string, args: string[] = [], timeoutMs = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const envdUrl = `https://49983-${sandboxId}.e2b.app/process.Process/Start`;

  const resp = await fetch(envdUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/connect+json",
      "Connect-Protocol-Version": "1",
      "Connect-Timeout-Ms": String(timeoutMs),
      "Authorization": `Bearer ${envdAccessToken}`,
    },
    body: JSON.stringify({
      process: { cmd, args, envs: { DISPLAY: ":0" } },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Command failed ${resp.status}: ${err}`);
  }

  // Parse Connect streaming response (newline-delimited JSON)
  const text = await resp.text();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      const event = msg.result || msg;
      if (event.event?.data) {
        const data = event.event.data;
        if (data.stdout) stdout += atob(data.stdout);
        if (data.stderr) stderr += atob(data.stderr);
      }
      if (event.event?.end) {
        exitCode = event.event.end.exitCode || 0;
      }
    } catch {
      // Skip unparseable lines
    }
  }

  return { stdout, stderr, exitCode };
}

// Download a file from the sandbox
async function downloadFile(sandboxId: string, envdAccessToken: string, filePath: string): Promise<Uint8Array> {
  const url = `https://49983-${sandboxId}.e2b.app/files?path=${encodeURIComponent(filePath)}`;
  const resp = await fetch(url, {
    headers: { "Authorization": `Bearer ${envdAccessToken}` },
  });
  if (!resp.ok) throw new Error(`File download failed: ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

// Take a screenshot using pyautogui and return base64
async function captureScreenshot(sandboxId: string, envdAccessToken: string): Promise<string> {
  await runCommand(sandboxId, envdAccessToken, "python3", [
    "-c",
    "import pyautogui; pyautogui.screenshot('/tmp/screenshot.png')",
  ]);

  const imageBytes = await downloadFile(sandboxId, envdAccessToken, "/tmp/screenshot.png");
  return btoa(String.fromCharCode(...imageBytes));
}

// In-memory store for sandbox access tokens (edge function is short-lived, so this is per-request)
// We pass envdAccessToken through the client for simplicity
const sandboxTokens = new Map<string, string>();

async function waitForDesktopReady(sandboxId: string, envdAccessToken: string): Promise<{
  ready: boolean;
  screenshot?: string;
  waitedMs: number;
  message: string;
  error?: string;
}> {
  const startedAt = Date.now();
  let lastError = "Desktop is still starting";

  while (Date.now() - startedAt < DESKTOP_BOOT_TIMEOUT_MS) {
    try {
      const screenshot = await captureScreenshot(sandboxId, envdAccessToken);
      return {
        ready: true,
        screenshot,
        waitedMs: Date.now() - startedAt,
        message: "Desktop initialized and screenshot capture is available",
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Desktop is still starting";
      await new Promise((resolve) => setTimeout(resolve, DESKTOP_BOOT_POLL_MS));
    }
  }

  return {
    ready: false,
    waitedMs: Date.now() - startedAt,
    message: "Desktop did not finish initializing before timeout",
    error: lastError,
  };
}

// Call AI vision model to reason about screenshot and decide next action
async function aiReason(
  screenshotBase64: string,
  task: string,
  actionHistory: { action: string; reasoning: string }[],
  userMessage?: string
): Promise<{ action: string; params: any; reasoning: string; done: boolean; summary?: string }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

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
      "Authorization": `Bearer ${lovableKey}`,
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

  // Parse JSON from response (handle potential markdown wrapping)
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const userId = await getClerkUserId(req);
  if (!userId) return json({ error: "Unauthorized — sign in required" }, 401);

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // Create a new desktop sandbox
      case "start_session": {
        const sandbox = await e2bApi("/sandboxes", "POST", {
          templateID: "desktop",
          timeout: 300,
          metadata: { userId, task: body.task || "general" },
        });

        const sandboxId = sandbox.sandboxID;
        const envdAccessToken = sandbox.envdAccessToken;

        // Store token for subsequent requests
        sandboxTokens.set(sandboxId, envdAccessToken);

        return json({
          sessionId: sandboxId,
          streamUrl: null,
          envdAccessToken,
          status: "running",
        });
      }

      // Take a screenshot of the sandbox
      case "screenshot": {
        const { sessionId } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);
        const token = body.envdAccessToken || sandboxTokens.get(sessionId);
        if (!token) return json({ error: "Missing envdAccessToken" }, 400);

        try {
          const screenshot = await captureScreenshot(sessionId, token);
          return json({ screenshot });
        } catch (error) {
          return json({ screenshot: null, error: error instanceof Error ? error.message : "Screenshot unavailable" });
        }
      }

      case "wait_until_ready": {
        const { sessionId } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);
        const token = body.envdAccessToken || sandboxTokens.get(sessionId);
        if (!token) return json({ error: "Missing envdAccessToken" }, 400);

        const readiness = await waitForDesktopReady(sessionId, token);
        return readiness.ready ? json(readiness) : json(readiness, 408);
      }

      // Execute an action on the sandbox (mouse/keyboard)
      case "execute": {
        const { sessionId, actionType, params } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);
        const token = body.envdAccessToken || sandboxTokens.get(sessionId);
        if (!token) return json({ error: "Missing envdAccessToken" }, 400);

        let result: any = { success: true };
        let pyCode = "";

        switch (actionType) {
          case "click": {
            const x = params.x ?? 512;
            const y = params.y ?? 384;
            pyCode = `import pyautogui; pyautogui.click(${x}, ${y})`;
            break;
          }
          case "double_click": {
            const x = params.x ?? 512;
            const y = params.y ?? 384;
            pyCode = `import pyautogui; pyautogui.doubleClick(${x}, ${y})`;
            break;
          }
          case "move_mouse": {
            pyCode = `import pyautogui; pyautogui.moveTo(${params.x}, ${params.y})`;
            break;
          }
          case "type": {
            const escaped = params.text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            pyCode = `import pyautogui; pyautogui.typewrite('${escaped}', interval=0.02)`;
            break;
          }
          case "hotkey": {
            const keys = (params.keys as string[]).map((k: string) => `'${k}'`).join(", ");
            pyCode = `import pyautogui; pyautogui.hotkey(${keys})`;
            break;
          }
          case "scroll": {
            const amount = params.direction === "up" ? (params.amount || 3) : -(params.amount || 3);
            const sx = params.x ?? 512;
            const sy = params.y ?? 384;
            pyCode = `import pyautogui; pyautogui.scroll(${amount}, x=${sx}, y=${sy})`;
            break;
          }
          case "open_url": {
            const escaped = params.url.replace(/'/g, "\\'");
            await runCommand(sessionId, token, "bash", ["-c", `DISPLAY=:0 xdg-open '${escaped}' &`]);
            break;
          }
          case "wait": {
            result = { success: true, waited: params.seconds || 2 };
            break;
          }
          case "press": {
            pyCode = `import pyautogui; pyautogui.press('${params.key}')`;
            break;
          }
        }

        if (pyCode) {
          const cmdResult = await runCommand(sessionId, token, "python3", ["-c", pyCode]);
          if (cmdResult.exitCode !== 0) {
            result = { success: false, error: cmdResult.stderr || "Command failed" };
          }
        }

        return json(result);
      }

      // AI reasoning step: take screenshot, send to AI, get next action
      case "think": {
        const { sessionId, task, actionHistory, userMessage } = body;
        if (!sessionId || !task) return json({ error: "Missing sessionId or task" }, 400);
        const token = body.envdAccessToken || sandboxTokens.get(sessionId);
        if (!token) return json({ error: "Missing envdAccessToken" }, 400);

        let screenshotBase64 = "";

        try {
          screenshotBase64 = await captureScreenshot(sessionId, token);
        } catch {
          // If screenshot fails, use a blank description
        }

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

      // Destroy the sandbox
      case "stop_session": {
        const { sessionId } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        try {
          await e2bApi(`/sandboxes/${sessionId}`, "DELETE");
        } catch {
          // Sandbox may already be destroyed
        }
        sandboxTokens.delete(sessionId);
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

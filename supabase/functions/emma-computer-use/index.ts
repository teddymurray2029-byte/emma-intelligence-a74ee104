import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const E2B_API = "https://api.e2b.dev";

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

// E2B Desktop sandbox helpers
async function e2bRequest(path: string, method = "GET", body?: any) {
  const apiKey = Deno.env.get("E2B_API_KEY");
  if (!apiKey) throw new Error("E2B_API_KEY not configured");

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
  return resp.json();
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
        const sandbox = await e2bRequest("/sandboxes", "POST", {
          templateID: "desktop",
          timeout: 300, // 5 minute timeout
          metadata: { userId, task: body.task || "general" },
        });

        return json({
          sessionId: sandbox.sandboxID || sandbox.id,
          streamUrl: `https://${sandbox.sandboxID || sandbox.id}-8080-${sandbox.clientID || sandbox.clientId}.e2b.dev`,
          status: "running",
        });
      }

      // Take a screenshot of the sandbox
      case "screenshot": {
        const { sessionId } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        // Use E2B desktop API to take screenshot
        const apiKey = Deno.env.get("E2B_API_KEY")!;
        const screenshotResp = await fetch(
          `https://${sessionId}-8000.e2b.dev/screenshot`,
          { headers: { "X-API-Key": apiKey } }
        );

        if (!screenshotResp.ok) {
          // Fallback: try the sandbox API
          return json({ screenshot: null, error: "Screenshot unavailable" });
        }

        const buffer = await screenshotResp.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return json({ screenshot: base64 });
      }

      // Execute an action on the sandbox (mouse/keyboard)
      case "execute": {
        const { sessionId, actionType, params } = body;
        if (!sessionId) return json({ error: "Missing sessionId" }, 400);

        const apiKey = Deno.env.get("E2B_API_KEY")!;
        const controlUrl = `https://${sessionId}-8000.e2b.dev`;

        let result: any = { success: true };

        switch (actionType) {
          case "click":
          case "double_click":
          case "move_mouse": {
            await fetch(`${controlUrl}/mouse/${actionType}`, {
              method: "POST",
              headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({ x: params.x, y: params.y }),
            });
            break;
          }
          case "type": {
            await fetch(`${controlUrl}/keyboard/type`, {
              method: "POST",
              headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({ text: params.text }),
            });
            break;
          }
          case "hotkey": {
            await fetch(`${controlUrl}/keyboard/hotkey`, {
              method: "POST",
              headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({ keys: params.keys }),
            });
            break;
          }
          case "scroll": {
            await fetch(`${controlUrl}/mouse/scroll`, {
              method: "POST",
              headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
              body: JSON.stringify(params),
            });
            break;
          }
          case "open_url": {
            // Open URL via xdg-open or direct browser command
            await fetch(`${controlUrl}/execute`, {
              method: "POST",
              headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({ command: `xdg-open "${params.url}" &` }),
            });
            break;
          }
          case "wait": {
            // Just wait — client will handle timing
            result = { success: true, waited: params.seconds || 2 };
            break;
          }
        }

        return json(result);
      }

      // AI reasoning step: take screenshot, send to AI, get next action
      case "think": {
        const { sessionId, task, actionHistory, userMessage } = body;
        if (!sessionId || !task) return json({ error: "Missing sessionId or task" }, 400);

        // Take screenshot first
        const apiKey = Deno.env.get("E2B_API_KEY")!;
        let screenshotBase64 = "";

        try {
          const screenshotResp = await fetch(
            `https://${sessionId}-8000.e2b.dev/screenshot`,
            { headers: { "X-API-Key": apiKey } }
          );
          if (screenshotResp.ok) {
            const buffer = await screenshotResp.arrayBuffer();
            screenshotBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          }
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
          await e2bRequest(`/sandboxes/${sessionId}`, "DELETE");
        } catch {
          // Sandbox may already be destroyed
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

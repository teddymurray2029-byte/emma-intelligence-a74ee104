import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Sandbox } from "https://esm.sh/@e2b/code-interpreter@1.2.0";
import { getClerkUserId } from "../_shared/clerk-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Lightweight safety guard — block obviously destructive shell ops.
const DANGEROUS = [
  /rm\s+-rf\s+\//i,
  /:\(\)\s*\{\s*:\|:&\s*\}/, // fork bomb
  /mkfs\./i,
  /dd\s+if=.+of=\/dev\//i,
  /\bshutdown\b/i,
  /\breboot\b/i,
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const E2B_API_KEY = Deno.env.get("E2B_API_KEY");
  if (!E2B_API_KEY) {
    return json(
      {
        error: "Code execution not configured",
        message:
          "E2B_API_KEY is required. Add it in Cloud → Edge Function Secrets to enable sandboxed code execution.",
      },
      501,
    );
  }

  // Require an authenticated Clerk user — prevents anonymous abuse of paid sandbox minutes.
  const userId = await getClerkUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  let body: { code?: string; language?: string; timeoutMs?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const code = (body.code ?? "").toString();
  const language = (body.language ?? "python").toString().toLowerCase();
  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs ?? 30_000), 1_000), 120_000);

  if (!code.trim()) return json({ error: "Code is required" }, 400);
  if (code.length > 50_000) return json({ error: "Code exceeds 50KB limit" }, 400);
  for (const pattern of DANGEROUS) {
    if (pattern.test(code)) {
      return json({ error: `Blocked dangerous pattern: ${pattern.source}` }, 400);
    }
  }
  if (!["python", "javascript", "typescript", "bash", "shell"].includes(language)) {
    return json({ error: `Unsupported language: ${language}` }, 400);
  }

  const startedAt = Date.now();
  let sandbox: Sandbox | null = null;
  try {
    sandbox = await Sandbox.create({ apiKey: E2B_API_KEY, timeoutMs: 60_000 });

    let stdout = "";
    let stderr = "";
    const results: Array<{ type: string; value: unknown }> = [];
    let error: { name: string; value: string; traceback?: string } | null = null;

    if (language === "bash" || language === "shell") {
      const cmd = await sandbox.commands.run(code, { timeoutMs });
      stdout = cmd.stdout ?? "";
      stderr = cmd.stderr ?? "";
      if (cmd.exitCode !== 0) {
        error = { name: "ShellError", value: `Exited with code ${cmd.exitCode}` };
      }
    } else {
      // Python / JS / TS via Jupyter kernel in code-interpreter template.
      const execution = await sandbox.runCode(code, {
        language: language === "typescript" ? "ts" : language === "javascript" ? "js" : "python",
        timeoutMs,
      });
      stdout = (execution.logs?.stdout ?? []).join("");
      stderr = (execution.logs?.stderr ?? []).join("");
      for (const r of execution.results ?? []) {
        if (r.text) results.push({ type: "text", value: r.text });
        if (r.png) results.push({ type: "image/png", value: r.png });
        if (r.html) results.push({ type: "text/html", value: r.html });
        if (r.json) results.push({ type: "application/json", value: r.json });
      }
      if (execution.error) {
        error = {
          name: execution.error.name ?? "Error",
          value: execution.error.value ?? "Execution failed",
          traceback: execution.error.traceback,
        };
      }
    }

    return json({
      success: !error,
      language,
      stdout,
      stderr,
      results,
      error,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown sandbox error";
    return json({ success: false, error: { name: "SandboxError", value: message }, durationMs: Date.now() - startedAt }, 500);
  } finally {
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {
        // best-effort cleanup
      }
    }
  }
});

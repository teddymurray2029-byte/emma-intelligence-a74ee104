import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getClerkUserId } from "./clerk-auth.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type Validator = (body: Record<string, unknown>) => string | null;

type GuardConfig = {
  functionName: string;
  allowAnonymous?: boolean;
  actionValidators?: Record<string, Validator>;
  rateLimit?: { windowMs: number; max: number };
};

type GuardSuccess = {
  response: null;
  userId: string | null;
  body: Record<string, unknown>;
  action: string | null;
  userClient: ReturnType<typeof createClient>;
  adminClient: ReturnType<typeof createClient>;
};

type GuardFail = { response: Response };

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function guardRequest(req: Request, config: GuardConfig): Promise<GuardSuccess | GuardFail> {
  if (req.method === "OPTIONS") {
    return { response: new Response(null, { headers: corsHeaders }) };
  }

  const userId = await getClerkUserId(req);
  if (!config.allowAnonymous && !userId) {
    return { response: json({ error: "Unauthorized" }, 401) };
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return { response: json({ error: "Invalid JSON body" }, 400) };
  }

  const action = typeof body.action === "string" ? body.action : null;

  if (config.actionValidators && action) {
    const validator = config.actionValidators[action];
    if (!validator) {
      return { response: json({ error: `Invalid action: ${action}` }, 400) };
    }
    const validationError = validator(body);
    if (validationError) {
      return { response: json({ error: validationError }, 400) };
    }
  }

  if (config.rateLimit) {
    const key = `${config.functionName}:${userId ?? getIp(req)}`;
    const now = Date.now();
    const current = rateLimitStore.get(key);
    if (!current || current.resetAt <= now) {
      rateLimitStore.set(key, { count: 1, resetAt: now + config.rateLimit.windowMs });
    } else if (current.count >= config.rateLimit.max) {
      return { response: json({ error: "Too many requests" }, 429) };
    } else {
      current.count += 1;
      rateLimitStore.set(key, current);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") || "",
      },
    },
  });

  const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  return {
    response: null,
    userId,
    body,
    action,
    userClient,
    adminClient,
  };
}

export function safeError(functionName: string, error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[${functionName}]`, message);
  return json({ error: "Internal server error" }, 500);
}

export function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return json(payload, status);
}

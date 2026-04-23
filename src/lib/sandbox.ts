// Singleton VM session manager for the IDE.
// Lazily starts an E2B-backed sandbox via emma-computer-use and reuses it across
// the terminal, the "Run" action, and any file sync operations.

const CU_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-computer-use`;

export type ShellResult = { exitCode: number; stdout: string; stderr: string };
export type SessionStatus = "idle" | "starting" | "ready" | "error";

type Session = { sessionId: string; envdAccessToken: string };

let session: Session | null = null;
let starting: Promise<Session> | null = null;
let getTokenFn: (() => Promise<string | null>) | null = null;
const listeners = new Set<(s: SessionStatus, msg?: string) => void>();
let status: SessionStatus = "idle";

function setStatus(next: SessionStatus, msg?: string) {
  status = next;
  for (const l of listeners) l(next, msg);
}

export function getSandboxStatus(): SessionStatus {
  return status;
}

export function onSandboxStatus(cb: (s: SessionStatus, msg?: string) => void) {
  listeners.add(cb);
  cb(status);
  return () => listeners.delete(cb);
}

export function configureSandbox(getToken: () => Promise<string | null>) {
  getTokenFn = getToken;
}

async function call(action: string, params: Record<string, any> = {}) {
  if (!getTokenFn) throw new Error("Sandbox not configured");
  const token = await getTokenFn();
  const resp = await fetch(CU_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...params }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((json as any).error || `Sandbox ${action} failed (${resp.status})`);
  return json;
}

export async function ensureSession(): Promise<Session> {
  if (session) return session;
  if (starting) return starting;
  setStatus("starting", "Booting sandbox VM…");
  starting = (async () => {
    try {
      const res = await call("start_session", { task: "Emma IDE shell" });
      session = { sessionId: res.sessionId, envdAccessToken: res.envdAccessToken };
      setStatus("ready", "Sandbox ready");
      return session;
    } catch (e: any) {
      setStatus("error", e?.message || "Failed to start sandbox");
      throw e;
    } finally {
      starting = null;
    }
  })();
  return starting;
}

export async function shellExec(command: string, opts: { cwd?: string; timeout?: number } = {}): Promise<ShellResult> {
  const s = await ensureSession();
  try {
    const res = await call("shell_exec", {
      sessionId: s.sessionId,
      envdAccessToken: s.envdAccessToken,
      command,
      cwd: opts.cwd,
      timeout: opts.timeout || 30,
    });
    return { exitCode: res.exitCode ?? 0, stdout: res.stdout || "", stderr: res.stderr || "" };
  } catch (e: any) {
    // Reset on hard failures so the next call re-creates the sandbox.
    if (/sandbox|session|404|410/i.test(e?.message || "")) session = null;
    throw e;
  }
}

export async function syncProject(projectName: string, files: { path: string; content: string }[]) {
  const s = await ensureSession();
  const res = await call("sync_project", {
    sessionId: s.sessionId,
    envdAccessToken: s.envdAccessToken,
    projectName,
    files,
  });
  return res as { projectDir: string; fileCount: number };
}

export async function stopSession() {
  if (!session) return;
  try {
    await call("stop_session", { sessionId: session.sessionId });
  } catch {}
  session = null;
  setStatus("idle");
}

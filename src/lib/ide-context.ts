// Lightweight pub/sub so the floating IDE chat can read live editor / terminal context
// without prop-drilling into every component.

export type IdeContext = {
  projectName?: string;
  projectId?: string;
  githubRepo?: string | null;
  files?: { path: string }[];
  activeFile?: { path: string; language: string; content: string } | null;
  lastTerminal?: { command: string; stdout: string; stderr: string; exitCode: number; at: number } | null;
  lastError?: string | null;
  lastSuccess?: string | null;
};

let state: IdeContext = {};
const listeners = new Set<(s: IdeContext) => void>();

export function setIdeContext(patch: Partial<IdeContext>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function getIdeContext(): IdeContext {
  return state;
}

export function onIdeContext(cb: (s: IdeContext) => void) {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}

export function pushTerminal(entry: NonNullable<IdeContext["lastTerminal"]>) {
  setIdeContext({
    lastTerminal: entry,
    lastError: entry.exitCode !== 0 ? (entry.stderr || entry.stdout || `exit ${entry.exitCode}`).slice(0, 2000) : state.lastError,
    lastSuccess: entry.exitCode === 0 ? `${entry.command} ✓`.slice(0, 200) : state.lastSuccess,
  });
}

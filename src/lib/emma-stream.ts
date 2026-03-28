export type Message = { role: "user" | "assistant"; content: string; imageUrl?: string; citations?: Citation[]; mode?: EmmaMode; metadata?: Record<string, any> };
export type EmmaMode = "chat" | "research" | "artifacts" | "voice" | "builder" | "think" | "memory" | "data" | "projects" | "agent";
export type AnswerStyle = "concise" | "standard" | "deep" | "direct";
export type Citation = { id: number; title: string; url?: string; snippet: string; source: "web" | "file" | "memory" | "internal" };
export type Artifact = { id: string; title: string; type: "text" | "markdown" | "code" | "html" | "react" | "plan" | "report" | "table" | "prompt"; content: string; language?: string; version: number; versions: { content: string; timestamp: string }[]; createdAt: string; updatedAt: string };
export type ResearchReport = { id: string; objective: string; status: "planning" | "searching" | "analyzing" | "synthesizing" | "complete" | "error"; plan: string[]; currentStep: number; sources: Citation[]; summary: string; fullReport: string; openQuestions: string[]; confidence: number; createdAt: string };
export type AgentTask = { id: string; description: string; status: "pending" | "planning" | "executing" | "paused" | "complete" | "failed"; plan: string[]; currentStep: number; logs: string[]; output: string; artifacts: string[]; createdAt: string };

const OLLAMA_URL = "http://localhost:11434/v1/chat/completions";
const OLLAMA_MODEL = "qwen3.5:9b";
const IMAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-image-gen`;
const RESEARCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-research`;

let _streamTokenGetter: (() => Promise<string | null>) | null = null;
export function setStreamTokenGetter(fn: () => Promise<string | null>) { _streamTokenGetter = fn; }

async function getAuthHeader(): Promise<Record<string, string>> {
  if (_streamTokenGetter) {
    const token = await _streamTokenGetter();
    if (token) return { Authorization: `Bearer ${token}` };
  }
  return { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` };
}

export async function streamChat({ messages, feedback, mode, answerStyle, onDelta, onDone, onError }: { messages: Message[]; feedback?: { type: string; summary: string }[]; mode?: EmmaMode; answerStyle?: AnswerStyle; onDelta: (deltaText: string) => void; onDone: () => void; onError: (error: string) => void }) {
  const resp = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages: messages.map(m => ({ role: m.role, content: m.content })), stream: true }),
  });

  if (!resp.ok) { const data = await resp.json().catch(() => ({ error: "Connection failed" })); onError(data.error || `Error ${resp.status}`); return; }
  if (!resp.body) { onError("No response body"); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { streamDone = true; break; }
      try { const parsed = JSON.parse(jsonStr); const content = parsed.choices?.[0]?.delta?.content as string | undefined; if (content) onDelta(content); } catch { textBuffer = line + "\n" + textBuffer; break; }
    }
  }

  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try { const parsed = JSON.parse(jsonStr); const content = parsed.choices?.[0]?.delta?.content as string | undefined; if (content) onDelta(content); } catch {}
    }
  }
  onDone();
}

export async function generateImage(prompt: string): Promise<{ imageUrl: string; text: string }> {
  const auth = await getAuthHeader();
  const resp = await fetch(IMAGE_URL, { method: "POST", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify({ prompt }) });
  if (!resp.ok) { const data = await resp.json().catch(() => ({ error: "Image generation failed" })); throw new Error(data.error || `Error ${resp.status}`); }
  return resp.json();
}

export async function runResearch(objective: string): Promise<ResearchReport> {
  const auth = await getAuthHeader();
  const resp = await fetch(RESEARCH_URL, { method: "POST", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify({ objective }) });
  if (!resp.ok) { const data = await resp.json().catch(() => ({ error: "Research failed" })); throw new Error(data.error || `Error ${resp.status}`); }
  return resp.json();
}

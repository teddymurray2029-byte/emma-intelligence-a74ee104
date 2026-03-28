// Browser fingerprinting for anti-abuse tracking
// Combines multiple signals for a stable, hard-to-spoof fingerprint

async function getCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(50, 0, 100, 25);
    ctx.fillStyle = "#069";
    ctx.fillText("Emma AI fp", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("Emma AI fp", 4, 17);
    return canvas.toDataURL();
  } catch {
    return "canvas-error";
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "no-webgl";
    const debugInfo = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return "no-debug-info";
    const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    return `${vendor}~${renderer}`;
  } catch {
    return "webgl-error";
  }
}

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateFingerprint(): Promise<string> {
  const cached = localStorage.getItem("emma_fp");
  if (cached) return cached;

  const components = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency?.toString() || "unknown",
    (navigator as any).deviceMemory?.toString() || "unknown",
    getWebGLFingerprint(),
    await getCanvasFingerprint(),
    navigator.platform || "unknown",
    new Date().getTimezoneOffset().toString(),
  ];

  const fp = await hashString(components.join("|"));
  localStorage.setItem("emma_fp", fp);
  return fp;
}

export function getStoredFingerprint(): string | null {
  return localStorage.getItem("emma_fp");
}

const FREE_MESSAGE_LIMIT = 25;
const USAGE_KEY = "emma_usage";

interface UsageData {
  count: number;
  firstUsed: string;
  isPaid: boolean;
}

export function getLocalUsage(): UsageData {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { count: 0, firstUsed: new Date().toISOString(), isPaid: false };
}

export function incrementLocalUsage(): UsageData {
  const usage = getLocalUsage();
  usage.count += 1;
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  return usage;
}

export function markLocalPaid() {
  const usage = getLocalUsage();
  usage.isPaid = true;
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
}

export function isOverLimit(): boolean {
  const usage = getLocalUsage();
  if (usage.isPaid) return false;
  return usage.count >= FREE_MESSAGE_LIMIT;
}

export function remainingFreeMessages(): number {
  const usage = getLocalUsage();
  if (usage.isPaid) return Infinity;
  return Math.max(0, FREE_MESSAGE_LIMIT - usage.count);
}

export const FREE_LIMIT = FREE_MESSAGE_LIMIT;

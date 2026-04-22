/**
 * URL scope matcher for engagement guardrails.
 * Supports exact domains, wildcard subdomains (*.example.com), and bare IPs.
 */

export type EngagementScope = {
  inScope: string[];   // e.g. ["example.com", "*.example.com", "10.0.0.5"]
  outOfScope: string[]; // explicit blocklist (overrides in-scope)
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

export function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isUrlInScope(url: string, scope: EngagementScope): { allowed: boolean; reason: string } {
  const host = extractHost(url);
  if (!host) return { allowed: false, reason: "Invalid URL" };

  for (const pattern of scope.outOfScope) {
    if (hostMatchesPattern(host, pattern)) {
      return { allowed: false, reason: `Host '${host}' is explicitly out-of-scope (${pattern})` };
    }
  }

  if (scope.inScope.length === 0) {
    return { allowed: true, reason: "No scope defined — permissive mode" };
  }

  for (const pattern of scope.inScope) {
    if (hostMatchesPattern(host, pattern)) {
      return { allowed: true, reason: `Matches in-scope pattern: ${pattern}` };
    }
  }

  return { allowed: false, reason: `Host '${host}' is not in the allowed scope` };
}

export function parseScopeList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const DESTRUCTIVE_PATTERNS = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\brm\s+-rf\s+\//i,
  /\b:\(\)\{\s*:\|:&\s*\}/,                 // fork bomb
  /\bshutdown\b|\breboot\b/i,
  /\bmkfs\b|\bdd\s+if=/i,
];

export function isDestructivePayload(text: string): { destructive: boolean; matched?: string } {
  if (!text) return { destructive: false };
  for (const re of DESTRUCTIVE_PATTERNS) {
    if (re.test(text)) return { destructive: true, matched: re.source };
  }
  return { destructive: false };
}

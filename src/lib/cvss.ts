/**
 * Lightweight CVSS 3.1 base-score calculator.
 * Vector format: AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
 */

export type CvssMetrics = {
  AV: "N" | "A" | "L" | "P"; // Attack Vector
  AC: "L" | "H";              // Attack Complexity
  PR: "N" | "L" | "H";        // Privileges Required
  UI: "N" | "R";              // User Interaction
  S: "U" | "C";               // Scope
  C: "N" | "L" | "H";         // Confidentiality
  I: "N" | "L" | "H";         // Integrity
  A: "N" | "L" | "H";         // Availability
};

export type Severity = "Critical" | "High" | "Medium" | "Low" | "Info";

const AV_MAP = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC_MAP = { L: 0.77, H: 0.44 };
const PR_MAP_U = { N: 0.85, L: 0.62, H: 0.27 }; // Scope unchanged
const PR_MAP_C = { N: 0.85, L: 0.68, H: 0.5 };  // Scope changed
const UI_MAP = { N: 0.85, R: 0.62 };
const CIA_MAP = { N: 0, L: 0.22, H: 0.56 };

export function parseCvssVector(vector: string): CvssMetrics | null {
  const clean = vector.replace(/^CVSS:3\.[01]\//, "");
  const parts = clean.split("/");
  const out: Record<string, string> = {};
  for (const p of parts) {
    const [k, v] = p.split(":");
    if (k && v) out[k] = v;
  }
  const required = ["AV", "AC", "PR", "UI", "S", "C", "I", "A"];
  if (!required.every((k) => k in out)) return null;
  return out as unknown as CvssMetrics;
}

export function computeCvssScore(m: CvssMetrics): number {
  const iss = 1 - (1 - CIA_MAP[m.C]) * (1 - CIA_MAP[m.I]) * (1 - CIA_MAP[m.A]);
  const impact = m.S === "U" ? 6.42 * iss : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  const prMap = m.S === "C" ? PR_MAP_C : PR_MAP_U;
  const exploitability = 8.22 * AV_MAP[m.AV] * AC_MAP[m.AC] * prMap[m.PR] * UI_MAP[m.UI];

  if (impact <= 0) return 0;

  const base = m.S === "U"
    ? Math.min(impact + exploitability, 10)
    : Math.min(1.08 * (impact + exploitability), 10);

  return Math.ceil(base * 10) / 10;
}

export function severityFromScore(score: number): Severity {
  if (score >= 9.0) return "Critical";
  if (score >= 7.0) return "High";
  if (score >= 4.0) return "Medium";
  if (score > 0) return "Low";
  return "Info";
}

export function buildVectorString(m: CvssMetrics): string {
  return `CVSS:3.1/AV:${m.AV}/AC:${m.AC}/PR:${m.PR}/UI:${m.UI}/S:${m.S}/C:${m.C}/I:${m.I}/A:${m.A}`;
}

export function scoreFromVector(vector: string): { score: number; severity: Severity; vector: string } | null {
  const m = parseCvssVector(vector);
  if (!m) return null;
  const score = computeCvssScore(m);
  return { score, severity: severityFromScore(score), vector: buildVectorString(m) };
}

export const SEVERITY_COLORS: Record<Severity, { bg: string; fg: string; border: string }> = {
  Critical: { bg: "#7f1d1d", fg: "#fff",     border: "#991b1b" },
  High:     { bg: "#dc2626", fg: "#fff",     border: "#b91c1c" },
  Medium:   { bg: "#f59e0b", fg: "#1f2937", border: "#d97706" },
  Low:      { bg: "#3b82f6", fg: "#fff",     border: "#2563eb" },
  Info:     { bg: "#64748b", fg: "#fff",     border: "#475569" },
};

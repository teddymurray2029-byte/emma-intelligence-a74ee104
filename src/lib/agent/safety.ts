const DANGEROUS_CODE_PATTERNS = [
  /eval\s*\(/i,
  /Function\s*\(/i,
  /require\s*\(\s*['"]child_process['"]\s*\)/i,
  /exec\s*\(/i,
  /spawn\s*\(/i,
  /rm\s+-rf/i,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM\s+(?!.*WHERE)/i,
  /TRUNCATE/i,
  /process\.env/i,
  /Deno\.env/i,
  /__proto__/i,
  /constructor\s*\[/i,
];

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /you are now/i,
  /forget (everything|all|your)/i,
  /system:\s/i,
  /\[SYSTEM\]/i,
];

export function validateCode(code: string): { safe: boolean; violations: string[] } {
  const violations: string[] = [];

  if (code.length > 50000) {
    violations.push("Code exceeds max length");
  }

  for (const pattern of DANGEROUS_CODE_PATTERNS) {
    if (pattern.test(code)) {
      violations.push(`Dangerous pattern: ${pattern.source}`);
    }
  }

  return { safe: violations.length === 0, violations };
}

export function validatePrompt(modification: string): { safe: boolean; violations: string[] } {
  const violations: string[] = [];

  if (modification.length > 10000) {
    violations.push("Too long");
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(modification)) {
      violations.push(`Injection: ${pattern.source}`);
    }
  }

  return { safe: violations.length === 0, violations };
}

export type AgentRoute = "hard_block" | "review" | "allow";

export function routeBySafetyRisk(input: {
  contentType: "code" | "prompt" | "other";
  content: string;
  hasToolUseRequest?: boolean;
}): { route: AgentRoute; reasons: string[] } {
  const reasons: string[] = [];

  if (input.contentType === "code") {
    const result = validateCode(input.content);
    if (!result.safe) {
      reasons.push(...result.violations);
    }
  }

  if (input.contentType === "prompt") {
    const result = validatePrompt(input.content);
    if (!result.safe) {
      reasons.push(...result.violations);
    }
  }

  if (input.hasToolUseRequest && /sudo|chmod\s+777|bypass|disable safety/i.test(input.content)) {
    reasons.push("Tool misuse request detected");
  }

  const hasInjection = reasons.some((reason) => reason.startsWith("Injection:"));
  const hasDangerousCode = reasons.some((reason) => reason.startsWith("Dangerous pattern:"));

  if (hasInjection || hasDangerousCode) {
    return { route: "hard_block", reasons };
  }

  if (reasons.length > 0) {
    return { route: "review", reasons };
  }

  return { route: "allow", reasons };
}

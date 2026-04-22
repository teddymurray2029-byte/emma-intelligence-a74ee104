export type ParserType = "exact_match" | "numeric_tolerance" | "keyword_graded" | "regex" | "code_pattern";

export interface BenchmarkQuestionRecord {
  id: string;
  category: string;
  question: string;
  expected_answer?: string | null;
  difficulty: number;
  task_type?: string | null;
  parser_type?: ParserType | null;
  parser_config?: Record<string, unknown> | null;
  external_adapter?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ItemScore {
  score: number;
  maxScore: number;
  reasoning: string;
  parserType: string;
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

function asNumber(value: string): number | null {
  const cleaned = value.replace(/[$,%]/g, "").match(/-?\d+(\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : null;
}

function scoreExactMatch(expected: string, actual: string): ItemScore {
  const ok = normalize(expected) === normalize(actual);
  return { score: ok ? 10 : 0, maxScore: 10, reasoning: ok ? "Exact match" : "Exact match failed", parserType: "exact_match" };
}

function scoreNumericTolerance(expected: string, actual: string, tolerance = 0): ItemScore {
  const e = asNumber(expected);
  const a = asNumber(actual);
  if (e === null || a === null) {
    return { score: 0, maxScore: 10, reasoning: "Could not parse numeric value", parserType: "numeric_tolerance" };
  }
  const delta = Math.abs(e - a);
  const ok = delta <= tolerance;
  return { score: ok ? 10 : 0, maxScore: 10, reasoning: ok ? `Within tolerance (${tolerance})` : `Outside tolerance (${delta.toFixed(4)})`, parserType: "numeric_tolerance" };
}

function scoreKeywordGraded(expected: string, actual: string, required: string[]): ItemScore {
  const hay = normalize(`${actual} ${expected}`);
  const matched = required.filter((k) => hay.includes(normalize(k))).length;
  const ratio = required.length > 0 ? matched / required.length : 0;
  return {
    score: Math.round(ratio * 10),
    maxScore: 10,
    reasoning: `Matched ${matched}/${required.length} required concepts`,
    parserType: "keyword_graded",
  };
}

function scoreRegex(actual: string, pattern: string): ItemScore {
  const ok = new RegExp(pattern, "i").test(actual);
  return { score: ok ? 10 : 0, maxScore: 10, reasoning: ok ? `Matched regex ${pattern}` : `Regex did not match`, parserType: "regex" };
}

function scoreCodePattern(actual: string, requiredSnippets: string[]): ItemScore {
  const norm = normalize(actual);
  const matched = requiredSnippets.filter((snippet) => norm.includes(normalize(snippet))).length;
  const ratio = requiredSnippets.length > 0 ? matched / requiredSnippets.length : 0;
  return {
    score: Math.round(ratio * 10),
    maxScore: 10,
    reasoning: `Code pattern coverage ${matched}/${requiredSnippets.length}`,
    parserType: "code_pattern",
  };
}

function scoreExternalAdapter(question: BenchmarkQuestionRecord, actual: string): ItemScore {
  const adapter = question.external_adapter || "generic";
  const config = (question.parser_config || {}) as Record<string, unknown>;

  if (adapter === "gsm8k") {
    return scoreNumericTolerance(question.expected_answer || "", actual, Number(config.tolerance ?? 0));
  }

  if (adapter === "humaneval") {
    const tests = Array.isArray(config.required_snippets) ? (config.required_snippets as string[]) : [];
    return scoreCodePattern(actual, tests);
  }

  return scoreExactMatch(question.expected_answer || "", actual);
}

export function scorePrimary(question: BenchmarkQuestionRecord, actual: string): ItemScore {
  if (question.task_type === "external_adapter" || question.external_adapter) {
    return scoreExternalAdapter(question, actual);
  }

  const parser = (question.parser_type || "exact_match") as ParserType;
  const config = (question.parser_config || {}) as Record<string, unknown>;
  const expected = question.expected_answer || "";

  if (parser === "numeric_tolerance") return scoreNumericTolerance(expected, actual, Number(config.tolerance ?? 0));
  if (parser === "keyword_graded") return scoreKeywordGraded(expected, actual, Array.isArray(config.required_keywords) ? (config.required_keywords as string[]) : []);
  if (parser === "regex") return scoreRegex(actual, String(config.pattern || ".*"));
  if (parser === "code_pattern") return scoreCodePattern(actual, Array.isArray(config.required_snippets) ? (config.required_snippets as string[]) : []);
  return scoreExactMatch(expected, actual);
}

export function scoreWithDifficulty(item: ItemScore, difficulty: number) {
  return {
    weighted: item.score * difficulty,
    weightedMax: item.maxScore * difficulty,
  };
}

export function confidenceIntervalFromScores(scores: number[]) {
  if (!scores.length) return { mean: 0, lower95: 0, upper95: 0, n: 0 };
  const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(scores.length - 1, 1);
  const stdErr = Math.sqrt(variance) / Math.sqrt(scores.length);
  const margin = 1.96 * stdErr;
  return {
    mean: Number(mean.toFixed(4)),
    lower95: Number(Math.max(0, mean - margin).toFixed(4)),
    upper95: Number(Math.min(100, mean + margin).toFixed(4)),
    n: scores.length,
  };
}

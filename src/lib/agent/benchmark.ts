export type BenchmarkQuestion = {
  category: string;
  difficulty: number;
};

export type EvaluationResult = {
  score: number;
  reasoning: string;
};

export type BenchmarkRunRecord = {
  total_score: number;
  system_prompt_version?: number | null;
};

export function computeBenchmarkScores(
  questions: BenchmarkQuestion[],
  evaluations: EvaluationResult[],
): {
  normalizedScore: number;
  categoryScores: Record<string, number>;
} {
  const categoryScores: Record<string, { total: number; max: number }> = {};

  questions.forEach((question, idx) => {
    const evaluation = evaluations[idx] ?? { score: 0, reasoning: "Missing evaluation" };
    const weightedScore = evaluation.score * question.difficulty;
    const maxScore = 10 * question.difficulty;

    if (!categoryScores[question.category]) {
      categoryScores[question.category] = { total: 0, max: 0 };
    }

    categoryScores[question.category].total += weightedScore;
    categoryScores[question.category].max += maxScore;
  });

  const totals = Object.values(categoryScores);
  const totalScore = totals.reduce((sum, entry) => sum + entry.total, 0);
  const maxScore = totals.reduce((sum, entry) => sum + entry.max, 0);

  const normalizedScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const normalizedByCategory = Object.fromEntries(
    Object.entries(categoryScores).map(([category, score]) => [
      category,
      score.max > 0 ? Math.round((score.total / score.max) * 100) : 0,
    ]),
  );

  return { normalizedScore, categoryScores: normalizedByCategory };
}

export function selectBestPromptVersion(
  runs: BenchmarkRunRecord[],
  currentPromptVersion: number,
): {
  variants: Array<{ version: number; avg: number; runs: number }>;
  bestVersion?: number;
  autoSwitched: boolean;
  switchedTo?: number;
} {
  if (runs.length < 3) {
    return { variants: [], autoSwitched: false };
  }

  const byVersion: Record<number, number[]> = {};
  for (const run of runs) {
    const version = run.system_prompt_version ?? 1;
    byVersion[version] ??= [];
    byVersion[version].push(Number(run.total_score));
  }

  const variants = Object.entries(byVersion)
    .map(([version, scores]) => ({
      version: Number(version),
      avg: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      runs: scores.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  const best = variants[0];
  const current = variants.find((v) => v.version === currentPromptVersion);

  const shouldSwitch = Boolean(
    best &&
      current &&
      best.version !== currentPromptVersion &&
      best.runs >= 2 &&
      best.avg - current.avg >= 5,
  );

  return {
    variants,
    bestVersion: best?.version,
    autoSwitched: shouldSwitch,
    switchedTo: shouldSwitch ? best?.version : undefined,
  };
}

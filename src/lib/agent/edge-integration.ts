import { computeBenchmarkScores, type BenchmarkQuestion, type EvaluationResult } from "@/lib/agent/benchmark";

export type ChatMessage = { role: "system" | "user"; content: string };
export type AIResponder = (messages: ChatMessage[], model?: string) => Promise<string>;

function parseJsonSafely<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value.replace(/```json\n?/g, "").replace(/```/g, "").trim()) as T;
  } catch {
    return fallback;
  }
}

export async function runBenchmarkEvaluation(input: {
  questions: Array<BenchmarkQuestion & { question: string; expectedAnswer: string }>;
  systemPrompt: string;
  ai: AIResponder;
}): Promise<{ score: number; categoryScores: Record<string, number>; results: EvaluationResult[] }> {
  const evaluations: EvaluationResult[] = [];

  for (const question of input.questions) {
    const answer = await input.ai([
      { role: "system", content: input.systemPrompt },
      { role: "user", content: question.question },
    ]);

    const judge = await input.ai([
      { role: "system", content: 'Score 0-10. Return JSON: {"score": N, "reasoning": "..."}' },
      {
        role: "user",
        content: `Q: ${question.question}\nExpected: ${question.expectedAnswer}\nActual: ${answer}`,
      },
    ]);

    const evaluation = parseJsonSafely<EvaluationResult>(judge, {
      score: 5,
      reasoning: "Parse error",
    });

    evaluations.push(evaluation);
  }

  const scored = computeBenchmarkScores(input.questions, evaluations);
  return { score: scored.normalizedScore, categoryScores: scored.categoryScores, results: evaluations };
}

export async function runAutonomousLoopCycle(input: {
  goalContext: string;
  worldModel: string;
  memories: string;
  ai: AIResponder;
}): Promise<{ task: string; quality: number }> {
  const decisionResponse = await input.ai([
    {
      role: "system",
      content:
        'Return ONLY JSON: {"task": "description of task", "goal_id": "which goal this advances", "reasoning": "why this task now"}',
    },
    {
      role: "user",
      content: `Active goals:\n${input.goalContext}\n\nWorld model:${input.worldModel}\n\nRecent memories:\n${input.memories}`,
    },
  ]);

  const decision = parseJsonSafely<{ task?: string }>(decisionResponse, {});
  const task = decision.task ?? "Review and consolidate active goals";

  const executionResult = await input.ai([
    {
      role: "system",
      content: "Complete this self-directed task thoroughly.",
    },
    {
      role: "user",
      content: `Task: ${task}`,
    },
  ]);

  const qualityResponse = await input.ai(
    [
      {
        role: "system",
        content: 'Rate quality 1-10. Return ONLY JSON: {"quality": <1-10>, "progress": "description"}',
      },
      {
        role: "user",
        content: `Task: ${task}\nResult: ${executionResult}`,
      },
    ],
    "google/gemini-2.5-flash-lite",
  );

  const quality = parseJsonSafely<{ quality?: number }>(qualityResponse, { quality: 5 }).quality ?? 5;
  return { task, quality };
}

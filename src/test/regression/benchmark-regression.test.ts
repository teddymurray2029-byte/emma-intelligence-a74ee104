import { describe, expect, it } from "vitest";

import { computeBenchmarkScores } from "@/lib/agent/benchmark";

describe("regression: benchmark scoring integrity", () => {
  it("preserves historical weighted-score behavior", () => {
    const fixture = {
      questions: [
        { category: "logic", difficulty: 1 },
        { category: "logic", difficulty: 3 },
        { category: "coding", difficulty: 2 },
      ],
      evaluations: [
        { score: 6, reasoning: "ok" },
        { score: 9, reasoning: "strong" },
        { score: 4, reasoning: "weak" },
      ],
    };

    const outcome = computeBenchmarkScores(fixture.questions, fixture.evaluations);

    expect(outcome).toEqual({
      normalizedScore: 68,
      categoryScores: {
        logic: 83,
        coding: 40,
      },
    });
  });

  it("returns zero score when no benchmark questions exist", () => {
    const outcome = computeBenchmarkScores([], []);
    expect(outcome).toEqual({ normalizedScore: 0, categoryScores: {} });
  });
});

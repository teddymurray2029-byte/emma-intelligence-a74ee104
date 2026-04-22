import { describe, expect, it, vi } from "vitest";

import { runAutonomousLoopCycle, runBenchmarkEvaluation, type AIResponder } from "@/lib/agent/edge-integration";

describe("integration: edge workflows with mocked AI", () => {
  it("runs benchmark evaluation end-to-end with deterministic mocked judge", async () => {
    const ai: AIResponder = vi
      .fn()
      .mockResolvedValueOnce("Paris")
      .mockResolvedValueOnce('{"score":10,"reasoning":"exact"}')
      .mockResolvedValueOnce("4")
      .mockResolvedValueOnce('{"score":9,"reasoning":"correct"}');

    const result = await runBenchmarkEvaluation({
      ai,
      systemPrompt: "You are Emma",
      questions: [
        { category: "geo", difficulty: 1, question: "Capital of France?", expectedAnswer: "Paris" },
        { category: "math", difficulty: 2, question: "2+2?", expectedAnswer: "4" },
      ],
    });

    expect(result.score).toBe(93);
    expect(result.categoryScores).toEqual({ geo: 100, math: 90 });
    expect(result.results).toHaveLength(2);
  });

  it("runs autonomous cycle and falls back gracefully when decision JSON is malformed", async () => {
    const ai: AIResponder = vi
      .fn()
      .mockResolvedValueOnce("not-json")
      .mockResolvedValueOnce("Executed default task")
      .mockResolvedValueOnce('{"quality":7,"progress":"advanced"}');

    const result = await runAutonomousLoopCycle({
      ai,
      goalContext: "[P1] ship safety tests",
      worldModel: "{\"state\":\"stable\"}",
      memories: "latest test failures fixed",
    });

    expect(result.task).toBe("Review and consolidate active goals");
    expect(result.quality).toBe(7);
  });
});

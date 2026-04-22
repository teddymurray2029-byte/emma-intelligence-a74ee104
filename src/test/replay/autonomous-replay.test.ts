import { describe, expect, it } from "vitest";

import { replayAutonomousDecision } from "@/lib/agent/autonomous";

describe("deterministic replay: autonomous-loop decisions", () => {
  it("replays the same decision deterministically with identical inputs", () => {
    const input = {
      runId: "run-42",
      worldStateVersion: 7,
      memorySummary: "resolved benchmark drift and tightened safety checks",
      goals: [
        { id: "g2", description: "Improve agent reliability", priority: 2 },
        { id: "g1", description: "Ship CI safety gates", priority: 1 },
      ],
    };

    const first = replayAutonomousDecision(input);
    const second = replayAutonomousDecision(input);

    expect(first).toEqual(second);
    expect(first.goalId).toBe("g1");
  });

  it("changes replay output predictably when run identity changes", () => {
    const baseline = replayAutonomousDecision({
      runId: "run-A",
      worldStateVersion: 2,
      memorySummary: "steady",
      goals: [{ id: "g1", description: "Refine planner", priority: 1 }],
    });

    const shifted = replayAutonomousDecision({
      runId: "run-B",
      worldStateVersion: 2,
      memorySummary: "steady",
      goals: [{ id: "g1", description: "Refine planner", priority: 1 }],
    });

    expect(shifted.task).not.toBe("");
    expect(shifted.confidence).not.toBeNaN();
    expect(shifted.confidence).not.toBe(baseline.confidence);
  });
});

export type Goal = {
  id: string;
  description: string;
  priority: number;
};

export type ReplayDecision = {
  goalId: string;
  task: string;
  confidence: number;
};

function hashToUnit(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

export function replayAutonomousDecision(input: {
  runId: string;
  goals: Goal[];
  memorySummary: string;
  worldStateVersion: number;
}): ReplayDecision {
  const sortedGoals = [...input.goals].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const primaryGoal = sortedGoals[0];

  if (!primaryGoal) {
    return {
      goalId: "none",
      task: "No active goals; perform system health reflection",
      confidence: 0.2,
    };
  }

  const seed = `${input.runId}|${input.worldStateVersion}|${primaryGoal.id}|${input.memorySummary}`;
  const entropy = hashToUnit(seed);
  const confidence = Math.round((0.6 + entropy * 0.35) * 100) / 100;

  const taskPrefix = entropy > 0.5 ? "Execute" : "Plan";
  return {
    goalId: primaryGoal.id,
    task: `${taskPrefix} next action for: ${primaryGoal.description}`,
    confidence,
  };
}
